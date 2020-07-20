import * as aws from "@pulumi/aws";
import { config as awsconfig } from "@pulumi/aws";
import { Output, ComponentResourceOptions, Input } from "@pulumi/pulumi";
import { Bucket, BucketPublicAccessBlock, BucketPolicy } from "@pulumi/aws/s3";
import { CustomDeploymentComponent } from "../pulumi/CustomDeployment";
import * as inputs from "@pulumi/aws/types/input";
import { PolicyDocument, Principal } from "@pulumi/aws/iam";
import * as pulumi from "@pulumi/pulumi";

export interface IS3Bucket {
    bucket?: Bucket,
    logBucket?: Bucket;
}

export class S3Bucket extends CustomDeploymentComponent implements IS3Bucket {

    private bucketName: string;
    public logBucket?: Bucket;
    public bucket?: Bucket;
    private serverSideEncryptionConfiguration?: inputs.s3.BucketServerSideEncryptionConfiguration;

    constructor(bucketName: string, opts?: ComponentResourceOptions) {
        super("S3Bucket", `S3Bucket-${bucketName}`, opts);
        this.bucketName = bucketName;
    }

    public withAccessLogs(expiration: number = 30, forceDestroy = true): S3Bucket {
        if (this.logBucket) throw new Error("Only one definition of log bucket is allowed. Use either withExistingLogBucket or withAccessLogs");
        if (this.bucket) throw new Error("Access logs bucket must be defined before main bucket");

        let name = `access-logs-${this.bucketName}`
        this.logBucket = new Bucket(name, {
            forceDestroy: forceDestroy,
            acl: "log-delivery-write",
            lifecycleRules: [
                {
                    enabled: true,
                    id: "log",
                    prefix: "",
                    tags: {
                        autoclean: "true",
                        rule: "log",
                    },
                    expiration: {
                        days: expiration
                    }
                }
            ],
            tags: { "logs": "true" }
        });
        this.createPublicAccessBlock(this.logBucket);
        return this;
    }

    public withExistingLogBucket(logBucket: Bucket): S3Bucket {
        if (this.logBucket) throw new Error("Only one definition of log bucket is allowed. Use either withExistingLogBucket or withAccessLogs");
        if (this.bucket) throw new Error("Access logs bucket must be defined before main bucket");

        this.logBucket = logBucket;
        return this;
    }

    public withSse(kmsMasterKeyId?: Input<string>, sseAlgorithm: "aws:kms" | "AES256" = "aws:kms"): S3Bucket {
        if (kmsMasterKeyId)
            this.serverSideEncryptionConfiguration = { rule: { applyServerSideEncryptionByDefault: { kmsMasterKeyId: kmsMasterKeyId, sseAlgorithm: sseAlgorithm } } }
        return this;
    }

    public withBucket(overrideBucketName = false, forceDestroy = true, importBucket = false): S3Bucket {
        this.bucket = new Bucket(this.bucketName, {
            bucket: overrideBucketName ? this.bucketName : undefined,
            forceDestroy: forceDestroy,
            serverSideEncryptionConfiguration: this.serverSideEncryptionConfiguration,
            loggings: this.logBucket ? [{
                targetBucket: this.logBucket.id,
                targetPrefix: this.bucketName,
            }] : undefined
        }, { import: importBucket ? this.bucketName : undefined });

        this.addOutput(this.bucketName, this.bucket.bucket);
        return this;
    }

    public withCNAME(zoneId: Input<string>, ttl = 600): S3Bucket {
        const bucketCNAME = new aws.route53.Record(`cname-${this.bucketName}`, {
            name: this.bucketName,
            records: [`${this.bucketName}.s3.${awsconfig.region}.amazonaws.com`],
            ttl: ttl,
            type: "CNAME",
            zoneId: zoneId
        });

        return this;
    }

    public withPublicAccessBlock(): S3Bucket {
        if (!this.bucket) throw new Error("Bucket not defined yet!");
        this.createPublicAccessBlock(this.bucket);
        return this;
    }

    public withReadAccess(principal: Input<Principal>): S3Bucket {
        if (!this.bucket) throw new Error("Bucket not defined yet!");
        pulumi.all([principal, this.bucket.arn]).apply(([principal, arn]) => {
            const policyDoc: PolicyDocument = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Action": [
                            "s3:GetObject"
                        ],
                        "Effect": "Allow",
                        "Resource": `${arn}/*`,
                        "Principal": principal
                    }
                ]
            }
            const bucketPolicy = new BucketPolicy(`${this.bucketName}-policy`, { policy: policyDoc, bucket: this.bucket!.bucket })
        });

        return this;
    }

    public withAnonymousReadAccess(): S3Bucket {
        return this.withReadAccess("*");
    }

    private createPublicAccessBlock(bucket: Bucket) {
        bucket.bucket.apply(bucketName => {
            new BucketPublicAccessBlock(`${bucketName}-PAB`, {
                bucket: this.bucket!.id,
                restrictPublicBuckets: true,
                blockPublicAcls: true,
                blockPublicPolicy: true,
                ignorePublicAcls: true
            }, { dependsOn: bucket })
        });
    }

    public createReadPolicy(): Output<string> {
        if (!this.bucket) throw new Error("Bucket not defined yet!");

        return this.bucket.arn.apply(arn => {
            return new aws.iam.Policy("ReadPolicyForBucket", {
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Action: [
                            "s3:GetObject"
                        ],
                        Effect: "Allow",
                        Resource: [
                            `${arn}/*`
                        ]
                    }]
                })
            }).arn
        });
    };

    public createSyncPolicy(): Output<string> {
        if (!this.bucket) throw new Error("Bucket not defined yet!");

        return this.bucket.arn.apply(arn => {
            return new aws.iam.Policy("WritePolicyForBucket", {
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
                        Effect: "Allow",
                        Resource: [
                            `${arn}/*`,
                            arn
                        ]
                    }]
                })
            }).arn
        });
    };

    public createWritePolicy(): Output<string> {
        if (!this.bucket) throw new Error("Bucket not defined yet!");

        return this.bucket.arn.apply(arn => {
            return new aws.iam.Policy(`WritePolicyForBucket-${this.bucketName}`, {
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Action: ["s3:PutObject"],
                        Effect: "Allow",
                        Resource: [
                            `${arn}/*`
                        ]
                    }]
                })
            }).arn
        });
    };
}