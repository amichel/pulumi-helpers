import { ComponentResourceOptions } from "@pulumi/pulumi";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import * as pulumi from "@pulumi/pulumi";
import { Queue, QueueEvent } from "@pulumi/aws/sqs";
import { Callback, Context } from '@pulumi/aws/lambda';
import { S3Bucket } from "./S3Bucket";
import { SqsSubscriberLambda } from "./SqsSubscriberLambda";

export class Sqs2S3SyncLambda extends CustomDeploymentComponent {

    constructor(name: string, queue: Queue, bucket: S3Bucket, opts?: ComponentResourceOptions) {
        super("Sqs2S3SyncLambda", `Sqs2S3SyncLambda-${name}`, opts);
        const bucketPolicy = bucket.createWritePolicy();

        pulumi.all([bucket.bucket?.bucket, bucketPolicy])
            .apply(([bucketName, bucektPolicyArn]) => {

                const lambda = new SqsSubscriberLambda(`${name}`, queue, {
                    callbackFactory: this.callbackFactory,
                    environment: { variables: { "bucketName": bucketName } },
                    policies: [bucektPolicyArn],
                })
                this.addDependencies(lambda);
            });
    }

    private callbackFactory(): Callback<QueueEvent, void> {
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3();

        return async function sqs2s3(event: QueueEvent, context: Context): Promise<void> {
            context.callbackWaitsForEmptyEventLoop = false;
            try {
                let records: any[] = [];
                event.Records.map(r => { let body = JSON.parse(r.body); records.push({ mid: body.MessageId, mess: body.Message, timestamp: body.Timestamp, sub: body.Subject }) });

                const now = new Date();
                const destparams = {
                    Bucket: process.env.bucketName,
                    Key: `/${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}/${now.getHours()}/${now.getTime()}.json`,
                    Body: JSON.stringify(records),
                    ContentType: "application/json"
                };

                await s3.putObject(destparams).promise();

            } catch (error) {
                console.log(error);
                throw error;
            }
        }
    }
}