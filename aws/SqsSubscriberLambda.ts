import { ComponentResourceOptions } from "@pulumi/pulumi";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import * as pulumi from "@pulumi/pulumi";
import { Queue, QueueEvent } from "@pulumi/aws/sqs";
import { CallbackFunction, NodeJS12dXRuntime, CallbackFunctionArgs } from '@pulumi/aws/lambda';
import { SQSFactory } from "./sqs";

export class SqsSubscriberLambda extends CustomDeploymentComponent {

    constructor(name: string, queue: Queue, functionArgs: CallbackFunctionArgs<QueueEvent, void>, opts?: ComponentResourceOptions) {
        super("SqsSubscriberLambda", `SqsSubscriberLambda-${name}`, opts);

        pulumi.all([queue.name, queue.kmsMasterKeyId])
            .apply(([queueName, kmsMasterKeyId]) => {
                if (functionArgs.deadLetterConfig)
                    throw Error("Deadletter config not supported in this scenario. This component defaults to always crating dead letter queue")

                const dlq = new Queue(`${queueName}-dlq`, { messageRetentionSeconds: 1209600, kmsMasterKeyId: kmsMasterKeyId })
                const sqsPolicy = SQSFactory.createSqsSendMessagePolicy(`${name}`, queue.arn, dlq.arn);

                sqsPolicy.apply(sqsPolicy => {
                    const lambda = new CallbackFunction(name, {
                        callbackFactory: functionArgs.callbackFactory,
                        timeout: functionArgs.timeout ?? 30,
                        runtime: functionArgs.runtime ?? NodeJS12dXRuntime,
                        environment: functionArgs.environment,
                        deadLetterConfig: { targetArn: dlq.arn },
                        policies: [sqsPolicy, "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole", ...functionArgs.policies ?? []],
                    })

                    queue.onEvent(`${name}-trigger`, lambda);
                    this.addDependencies(lambda);
                });
            });
    }
}