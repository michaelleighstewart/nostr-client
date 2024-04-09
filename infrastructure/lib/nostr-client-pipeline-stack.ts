import {Stack, StackProps, RemovalPolicy} from 'aws-cdk-lib';
import {CodeBuildStep, CodePipeline, CodePipelineSource, ManualApprovalStep} from "aws-cdk-lib/pipelines";
import { Construct } from 'constructs';
import { NostrClientPipelineStage } from './nostr-client-pipeline-stage';
import { NostrClientPipelineProd } from './nostr-client-pipeline-prod';

export class NostrClientPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, {
        env: {
            account: "183725167303",
            region: "us-west-2"
        }
    });

    // Pipeline code goes here
    const pipeline = new CodePipeline(this, 'Pipeline', {
        pipelineName: 'nostr-client-pipeline',
        synth: new CodeBuildStep('SynthStep', {
                input: CodePipelineSource.connection(
                    'michaelleighstewart/nostr-client',
                    'main',
                    { connectionArn: 'arn:aws:codestar-connections:ap-southeast-2:183725167303:connection/3ffeb8e9-2c07-4c61-9701-6d6ca56d48ce'}
                ),
                buildEnvironment: {
                    privileged: true
                },
                installCommands: [
                    'npm install -g aws-cdk',
                    'npm install -g aws-cdk-lib'
                ],
                commands: [
                    "cd infrastructure",
                    "npm i",
                    "npm run build",
                    "npx cdk synth",
                ],
                primaryOutputDirectory: 'cdk.out'
            },
        )
    });

    //Deploy
    const deploy = new NostrClientPipelineStage(this, 'Deploy');
    //const deployStage = pipeline.addStage(deploy, {pre: [testStep]});
    const deployStage = pipeline.addStage(deploy);

    //Approval
    pipeline.addStage(new NostrClientPipelineProd(this, 'Prod', {
        env: { account: props?.env?.account, region: 'us-west-1' },
      }), {
        pre: [ new ManualApprovalStep('PromoteToProd', {comment: 'Production Deployment is awaiting approval'}) ],
    });
}
}
