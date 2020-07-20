import * as pulumi from "@pulumi/pulumi";
import { Input, Output } from "@pulumi/pulumi";
import { Policy } from "@pulumi/aws/iam";
import { TopicPolicy } from "@pulumi/aws/sns";

export class SQSFactory {
    public static createSqsPublishPolicy(sourceArn: Input<string>, service: Input<string>): Output<string> {
        return pulumi.all([sourceArn, service]).apply(([sourceArn, service]) => {
            return JSON.stringify({
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {
                        "Service": `${service}.amazonaws.com`
                    },
                    "Action": ["sqs:SendMessage"],
                    "Resource": "*",
                    "Condition": {
                        "ArnEquals": {
                            "aws:SourceArn": sourceArn
                        }
                    }
                }]
            })
        });
    }

    // public static createSqsPublishPolicy(queue: Queue, sourceArn: Input<string>, service: Input<string>) {
    //     return pulumi.all([queue.namePrefix, queue.arn, sourceArn, service]).apply(([queueName, queueArn, sourceArn, service]) =>
    //         new QueuePolicy(`${queueName}-policy`, {
    //             queueUrl: queue.id,
    //             policy: JSON.stringify({
    //                 "Statement": [{
    //                     "Effect": "Allow",
    //                     "Principal": {
    //                         "Service": `${service}.amazonaws.com`
    //                     },
    //                     "Action": ["sqs:SendMessage"],
    //                     "Resource": queueArn,
    //                     "Condition": {
    //                         "ArnEquals": {
    //                             "aws:SourceArn": sourceArn
    //                         }
    //                     }
    //                 }]
    //             })
    //         }))
    // }
    public static createSqsPublishTopicPolicy(name: string, topicArn: Input<string>, ...queueArns: Input<string>[]) {

        let policy = {
            "Version": "2012-10-17",
            "Statement": {
                "Effect": "Allow",
                "Action": ["sqs:SendMessage"],
                "Resource": [] as string[]
            },
            "Condition": {
                "ArnEquals": {
                    "aws:SourceArn": topicArn
                }
            }
        };

        return pulumi.all(queueArns).apply(arns => {
            arns.map(queueArn =>
                policy.Statement.Resource.push(queueArn)
            )
            new TopicPolicy(`${name}-policy`, {
                arn: topicArn,
                policy: JSON.stringify(policy)
            }).arn
        });
    }

    public static createSqsSendMessagePolicy(name: string, ...queueArns: Input<string>[]): Output<string> {
        let policy = {
            "Version": "2012-10-17",
            "Statement": {
                "Effect": "Allow",
                "Action": ["sqs:SendMessage"],
                "Resource": [] as string[]
            }
        };

        return pulumi.all(queueArns).apply(arns => {
            arns.map(queueArn =>
                policy.Statement.Resource.push(queueArn)
            )
            return new Policy(`${name}-policy`, {
                policy: JSON.stringify(policy)
            }).arn
        });
    }
}