import { NostrClientStack } from './nostr-client-stack';
import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class NostrClientPipelineProd extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, {
            env: {
                account: "183725167303",
                region: "us-east-1"
            }
        });

        new NostrClientStack(this, 'NostrClientWebServiceProd', {env: {account: "183725167303", region: "us-east-1"}, environmentName: 'prod'});
    }
}