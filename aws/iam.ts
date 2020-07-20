import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { Input } from "@pulumi/pulumi";
import { User, Group, GroupMembership, GroupPolicyAttachment, ManagedPolicies, Role, Policy } from "@pulumi/aws/iam";
import { getArn } from "@pulumi/aws";
import { getResourceFromPolicyArn } from "./utils";



export class IamFactory {
    public static createGroup(groupName: string, overrideGroupName: boolean = true): Group {
        const group = new Group(groupName, { name: overrideGroupName ? groupName : undefined });
        return group;
    }

    public static createGroupMembership(users: Input<string>[], group: Group): GroupMembership | undefined {

        let groupMembership;
        group.name.apply(name => {
            groupMembership = new GroupMembership(`${name}-Membership`, { group: group.name, users: users });
        });
        return groupMembership;
    }

    public static createGroupWithMembership(users: Input<string>[], groupName: string, overrideGroupName: boolean = true): Group {
        const group = this.createGroup(groupName, overrideGroupName);
        const membership = this.createGroupMembership(users, group);
        return group;
    }

    public static createGroupMembershipWithPolices(users: Input<string>[], group: Group,
        policiesArns?: Input<string>[]): GroupMembership | undefined {

        const groupMembership = this.createGroupMembership(users, group);
        this.createGroupPolicyAttachements(group.name, policiesArns);

        return groupMembership;
    }

    public static createGroupPolicyAttachements(group: Input<string>,
        policiesArns?: Input<string>[]): void {

        let groupName = pulumi.interpolate`${group}`;

        policiesArns?.forEach(policy => {
            let p = pulumi.interpolate`${policy}`;
            p.apply(arn =>
                groupName.apply(name =>
                    getResourceFromPolicyArn(arn).apply(resource =>
                        new GroupPolicyAttachment(`GroupPolicyAttachment-${name}-${resource}`, {
                            group: group,
                            policyArn: policy
                        }))));
        });
    }

    public static createUserAndGroupWithPolices(userName: string, groupName: string, policiesArns?: Input<string>[],
        overrideUserName: boolean = true, overrideGroupName: boolean = true): { user: User, group: Group } {

        const user = new User(userName, { name: overrideUserName ? userName : undefined, forceDestroy: true });
        const group = this.createGroup(groupName, overrideGroupName);
        this.createGroupMembershipWithPolices([user.name], group, policiesArns);

        return { user: user, group: group };
    }

    public static createServiceRoleWithPolicy(roleName: string, services: string[], policyArns: Input<string>[]): Role {

        services.forEach((s, i) => services[i] = `${s}.amazonaws.com`);
        let policy = {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {
                    "Service": services
                },
                "Action": "sts:AssumeRole"
            }]
        };

        const role = new aws.iam.Role(roleName, { forceDetachPolicies: true, assumeRolePolicy: JSON.stringify(policy) });

        policyArns.map(policy => {
            let p = pulumi.interpolate`${policy}`;
            p.apply(arn =>
                getResourceFromPolicyArn(arn).apply(resource =>
                    new aws.iam.RolePolicyAttachment(`RoleAttachment-${roleName}-${resource}}`, { role: role, policyArn: policy })
                ))
        });

        return role;
    }

    public static createAutoScalingFullAccessPolicy(): Input<string> {
        return new Policy("AutoScalingFullAccessCustom", {
            policy: {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": "autoscaling:*",
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": "cloudwatch:PutMetricAlarm",
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": [
                            "ec2:DescribeAccountAttributes",
                            "ec2:DescribeAvailabilityZones",
                            "ec2:DescribeImages",
                            "ec2:DescribeInstanceAttribute",
                            "ec2:DescribeInstances",
                            "ec2:DescribeKeyPairs",
                            "ec2:DescribeLaunchTemplateVersions",
                            "ec2:DescribePlacementGroups",
                            "ec2:DescribeSecurityGroups",
                            "ec2:DescribeSpotInstanceRequests",
                            "ec2:DescribeSubnets",
                            "ec2:DescribeVpcClassicLink"
                        ],
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": [
                            "elasticloadbalancing:DescribeLoadBalancers",
                            "elasticloadbalancing:DescribeTargetGroups"
                        ],
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": "iam:CreateServiceLinkedRole",
                        "Resource": "*",
                        "Condition": {
                            "StringEquals": {
                                "iam:AWSServiceName": "autoscaling.amazonaws.com"
                            }
                        }
                    }
                ]
            }
        }).arn;
    }
}

