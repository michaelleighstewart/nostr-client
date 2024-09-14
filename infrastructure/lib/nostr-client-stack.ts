import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {RemovalPolicy} from 'aws-cdk-lib';
import {Bucket} from 'aws-cdk-lib/aws-s3';
import {CloudFrontWebDistribution, OriginProtocolPolicy, ViewerProtocolPolicy, ViewerCertificate, LambdaEdgeEventType} from 'aws-cdk-lib/aws-cloudfront';
import {BucketDeployment, Source} from 'aws-cdk-lib/aws-s3-deployment';
import {HostedZone, ARecord, RecordTarget} from "aws-cdk-lib/aws-route53";
import {CloudFrontTarget} from 'aws-cdk-lib/aws-route53-targets';
import {Certificate} from "aws-cdk-lib/aws-certificatemanager";
import {StringParameter} from 'aws-cdk-lib/aws-ssm';
import {NodejsFunction} from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

interface NostrClientStackProps extends StackProps {
  readonly environmentName: string;
}

export class NostrClientStack extends Stack {
  constructor(scope: Construct, id: string, props?: NostrClientStackProps) {
    super(scope, id, {env: {account: props!.env!.account!, region: props!.env!.region!}});

    const env = props!.environmentName!;
    const latestConfig = StringParameter.valueForStringParameter(this, '/web/configs/' + env);
    const zone = HostedZone.fromLookup(this, "GhostcopywriteZone_" + env, {domainName: 'ghostcopywrite.com'});
    var certificateArn = '';
    if (env == 'prod') {
      certificateArn = 'arn:aws:acm:us-east-1:183725167303:certificate/b85936dd-b48f-4f38-af23-164bfcfab9e5';
    }
    else {
      certificateArn = 'arn:aws:acm:us-east-1:183725167303:certificate/b9ad98b3-7c81-439c-b6e3-7e4c228dd9d8';
    }
    const certificate = Certificate.fromCertificateArn(this, 'GhostcopywriteDomainCert_' + env, certificateArn);
  
    const siteBucket = new Bucket(this, props!.environmentName! + ".ghostcopywrite.com", {
      bucketName: env == 'prod' ? 'ghostcopywrite.com' : props!.environmentName! + ".ghostcopywrite.com",
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Retrieve the secret
    const preRenderSecretKey = StringParameter.valueForStringParameter(this, '/prerenderToken');
    console.log(preRenderSecretKey.toString());
    
    const prerenderToken = preRenderSecretKey.toString();


    // Create a Lambda@Edge function for prerendering
    const prerenderFunction = new NodejsFunction(this, 'PrerenderFunction', {
      entry: '../lambda/prerender.js',
      handler: 'handler',
      runtime: Runtime.NODEJS_18_X,
      environment: {
        PRERENDER_TOKEN: prerenderToken,
      },
    });
  
    const siteDistribution = new CloudFrontWebDistribution(this, "GhostcopywriteSiteDistribution_" + props!.environmentName!, {
      originConfigs: [{
          customOriginSource: {
              domainName: siteBucket.bucketWebsiteDomainName,
              originProtocolPolicy: OriginProtocolPolicy.HTTP_ONLY
          },
          behaviors: [{
              isDefaultBehavior: true,
              lambdaFunctionAssociations: [{
                eventType: LambdaEdgeEventType.VIEWER_REQUEST,
                lambdaFunction: prerenderFunction.currentVersion
              }]
          }]
      }],
      viewerCertificate: ViewerCertificate.fromAcmCertificate(certificate, {
        aliases: [env == 'prod' ? 'ghostcopywrite.com' : env + '.ghostcopywrite.com']
      }),
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS
    });
  
    new BucketDeployment(this, "GhostcopywriteDeployment_" + props!.environmentName!, {
      sources: [Source.asset("../dist"), Source.data('config.json', latestConfig)],
      destinationBucket: siteBucket,
      distribution: siteDistribution,
      distributionPaths: ["/*"]
    });

    var siteTarget = RecordTarget.fromAlias(new CloudFrontTarget(siteDistribution));
    if (env == 'prod') {
      new ARecord(this, "GhostcopywriteARecord_" + env, 
        {zone: zone, 
          recordName: 'ghostcopywrite.com',
          target: siteTarget
        }
      );
    }
    else {
      new ARecord(this, "GhostcopywriteARecord_" + env, 
        {zone: zone, 
          recordName: env + '.ghostcopywrite.com',
          target: siteTarget
        }
      );
    }


  }
}
