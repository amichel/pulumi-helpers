import * as aws from "@pulumi/aws";
import { Output, Input } from "@pulumi/pulumi";

export class SNSFactory {

    public static createPublisherPolicyForAllTopics(): Output<string> {
        return new aws.iam.Policy("PublisherPolicyForAllTopics", {
            policy: JSON.stringify({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": "sns:Publish",
                        "Resource": "arn:aws:sns:*:*:*"
                    }
                ]
            })
        }).arn
    };
}