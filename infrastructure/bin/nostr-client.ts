#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NostrClientPipelineStack } from '../lib/nostr-client-pipeline-stack';

const app = new cdk.App();
//new InfrastructureStack(app, 'InfrastructureStack');
new NostrClientPipelineStack(app, 'NostrClientPipelineStack');
