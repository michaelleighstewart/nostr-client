import { NostrClientStack } from './nostr-client-stack';
import { Stage, StageProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class NostrClientPipelineStage extends Stage {
    constructor(scope: Construct, id: string, props?: StageProps) {
        super(scope, id, {
            env: {
                account: "183725167303",
                region: "us-west-2"
            }
        });

        new NostrClientStack(this, 'NostrClientWebServiceDev', {env: {account: "183725167303", region: "us-west-2"}, environmentName: 'dev'});
    }
}