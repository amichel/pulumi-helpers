import { ComponentResourceOptions, Input, Output } from "@pulumi/pulumi";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import { Queue, QueueEvent } from "@pulumi/aws/sqs";
import { Topic, TopicSubscription, TopicPolicy } from "@pulumi/aws/sns";
import { Sqs2S3SyncLambda } from "./Sqs2S3SyncLambda";
import { S3Bucket } from "./S3Bucket";
import * as pulumi from "@pulumi/pulumi";
import { SQSFactory } from "./sqs";
import { CallbackFunctionArgs } from "@pulumi/aws/lambda";
import { SqsSubscriberLambda } from "./SqsSubscriberLambda";
import { SnsPipelineConfig } from "../config/SnsPipelineConfig";

export interface ISnsPipelineConfig {
    successFeedbackSampleRate: number;
    visibilityTimeoutSeconds: number;
    maxMessageSize: number;
    messageRetentionSeconds: number;
}

export class SnsPipeline extends CustomDeploymentComponent {

    private topicName: string;
    private topic: Topic;
    private kmsMasterKeyId?: Input<string>;
    private config: ISnsPipelineConfig;

    public topicArn: Input<string>;
    
    constructor(topicName: string, snsServiceRoleArn: Input<string>, kmsMasterKeyId?: Input<string>,
        config: ISnsPipelineConfig = new SnsPipelineConfig(), opts?: ComponentResourceOptions) {
        super("SnsPipeline", `SnsPipeline-${topicName}`, opts);
        this.topicName = topicName;
        this.kmsMasterKeyId = kmsMasterKeyId;
        this.config = config;
        this.topic = new Topic(topicName, {
            httpFailureFeedbackRoleArn: snsServiceRoleArn,
            httpSuccessFeedbackRoleArn: snsServiceRoleArn,
            httpSuccessFeedbackSampleRate: this.config.successFeedbackSampleRate,
            lambdaFailureFeedbackRoleArn: snsServiceRoleArn,
            lambdaSuccessFeedbackRoleArn: snsServiceRoleArn,
            lambdaSuccessFeedbackSampleRate: this.config.successFeedbackSampleRate,
            sqsFailureFeedbackRoleArn: snsServiceRoleArn,
            sqsSuccessFeedbackRoleArn: snsServiceRoleArn,
            sqsSuccessFeedbackSampleRate: this.config.successFeedbackSampleRate,
            applicationFailureFeedbackRoleArn: snsServiceRoleArn,
            applicationSuccessFeedbackRoleArn: snsServiceRoleArn,
            applicationSuccessFeedbackSampleRate: this.config.successFeedbackSampleRate,
            kmsMasterKeyId: kmsMasterKeyId
        })

        this.topicArn = this.topic.arn;
    }

    public withSqsSubscriber(subscriberName: string, withDlq = true): SnsPipeline {
        this.createSqsSubscriber(subscriberName, withDlq);
        return this;
    }

    public withSqsLambdaSubscriber(subscriberName: string, functionArgs: CallbackFunctionArgs<QueueEvent, void>): SnsPipeline {
        this.createSqsSubscriber(subscriberName, true).then(queue => {
            const lambda = new SqsSubscriberLambda(`${this.topicName}-${subscriberName}`, queue, functionArgs);
            console.log(`${this.topicName}-${subscriberName}`)
        });
        return this;
    }

    public withS3SyncSubscriber(subscriberName: string): SnsPipeline {
        this.createSqsSubscriber(subscriberName, true).then(queue => {
            const bucket = new S3Bucket(`${this.topicName}-${subscriberName}`)
                .withAccessLogs()
                .withSse(this.kmsMasterKeyId)
                .withBucket()
                .withPublicAccessBlock();
            const lambda = new Sqs2S3SyncLambda(`${this.topicName}-${subscriberName}`, queue, bucket);
        });
        return this;
    }

    public withPolicy(principalArns: Input<string>[], actions: ("sns:Publish" | "sns:Subscribe")[]): SnsPipeline {
        pulumi.all([...principalArns, this.topicArn]).apply(([principalArns, topicArn]) => {
            new TopicPolicy(`${this.topicName}-policy`, {
                arn: this.topicArn,
                policy: JSON.stringify({
                    "Version": "2012-10-17",
                    "Statement": [
                        {
                            "Effect": "Allow",
                            "Action": actions,
                            "Resource": topicArn,
                            "Principal": {
                                "AWS": principalArns
                            }
                        }
                    ]
                })
            })
        })

        return this;
    }

    private async createSqsSubscriber(subscriberName: string, withDlq: boolean): Promise<Queue> {
        return await new Promise<string>((resolve, reject) => {
            if (withDlq) {
                const subscriberDLQ = new Queue(`${this.topicName}-${subscriberName}-dlq`, { messageRetentionSeconds: 1209600, kmsMasterKeyId: this.kmsMasterKeyId });
                subscriberDLQ.arn.apply(arn =>
                    resolve(JSON.stringify({
                        deadLetterTargetArn: arn,
                        maxReceiveCount: 10
                    })));
            }
            else
                resolve(undefined);
        }).then(redrivePolicy => {
            const queuePolicy = SQSFactory.createSqsPublishPolicy(this.topicArn, "sns");
            const subscriberQueue = new Queue(`${this.topicName}-${subscriberName}`, {
                namePrefix: `${this.topicName}-${subscriberName}`,
                redrivePolicy: redrivePolicy,
                visibilityTimeoutSeconds: this.config.visibilityTimeoutSeconds,
                messageRetentionSeconds: this.config.messageRetentionSeconds,
                maxMessageSize: this.config.maxMessageSize,
                kmsMasterKeyId: this.kmsMasterKeyId,
                policy: queuePolicy
            })

            const subscription = new TopicSubscription(`${this.topicName}-${subscriberName}-subscription`, { protocol: "sqs", topic: this.topic.arn, endpoint: subscriberQueue.arn })

            return subscriberQueue
        });
    }
}