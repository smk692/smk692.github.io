---
layout: post
emoji: 📒
title: "테라폼(Terraform) 기초의 모든것!"
date: '2023-04-25 02:15:25'
author: 손(Son/손민기)
tags: 테라폼 Terraform 인프라 AWS IaC 모듈화 DevOps
categories: Infra
---

## 📒 테라폼(Terraform) 이란?
> 테라폼(Terraform)은 인프라스트럭처를 코드로 관리하기 위한 오픈소스 도구입니다.
>  AWS, Google Cloud Platform, Microsoft Azure 등 다양한 클라우드 서비스 및 온프레미스 인프라를 지원하며, 코드로 인프라를 구성하고 변경사항을 추적, 관리할 수 있습니다.

테라폼을 사용하는 이유는 다음과 같습니다.

### 장점:

- 코드로 인프라를 관리하기 때문에, 반복적이고 일관성 있는 인프라 구성이 가능합니다.
  
- 코드 관리 도구(Git 등)를 사용하여 변경 이력을 추적하고, 이력에 따라 인프라를 복원할 수 있습니다.

- 다양한 클라우드 서비스 및 온프레미스 인프라를 지원하며, 인프라 복잡도가 높아지더라도 코드로 관리할 수 있습니다.
  
- 테라폼은 인프라를 변경할 때 새로운 인프라를 만들고 이전 인프라를 제거하는 방식으로 변경사항을 적용합니다. 이를 통해 변경사항 적용 중에도 인프라의 안정성을 유지할 수 있습니다.
  
### 단점:

- 학습 곡선이 높습니다. 테라폼은 다양한 기능과 구성 요소를 제공하기 때문에 처음 접근하는 사용자에게는 이해하기 어려울 수 있습니다.
- 테라폼 코드 작성 시 모듈화가 필요한 경우가 많습니다.
- 모듈화된 코드를 작성하려면, 추가적인 학습과 경험이 필요합니다.

<br/>

## ⚙️ 테라폼의 기본 파일 구성 및 셈플 정리

- main.tf 파일에는 인프라를 구성하는 리소스와 데이터 소스를 정의합니다.
    ```lua
    provider "aws" {
        region = var.region
    }

    resource "aws_instance" "example" {
        ami           = var.ami_id
        instance_type = var.instance_type

        tags = {
            Name = "ExampleInstance"
        }
    }
    ```
- variables.tf 파일에는 입력 변수를 정의합니다.
    ```lua
    variable "region" {
        type        = string
        description = "AWS region to create resources in"
        default     = "us-west-2"
    }

    variable "ami_id" {
        type        = string
        description = "AMI ID for EC2 instance"
    }

    variable "instance_type" {
        type        = string
        description = "EC2 instance type"
        default     = "t2.micro"
    }
    ```

- outputs.tf 파일에는 출력 변수를 정의합니다.
    ```lua
    output "public_ip" {
        value = aws_instance.example.public_ip
    }

    ```
- backend.tf 테라폼 상태 파일을 저장하는 위치와 형식을 지정할 수 있습니다. 
  
    ```lua
    # S3 버킷에 상태를 저장하는데 사용합니다. 
    # 동시성 체크 및 이미 만들어져 연관 있는 구조를 갖고올 떄 사용합니다.
    terraform {
     backend "s3" {
            bucket = "my-terraform-state"
            key    = "terraform.tfstate"
            region = "us-west-2"
        }
    }
  ```
- env.tfvars 파일에서는 환경 변수를 정의합니다. 환경 변수는 테라폼 실행 시 -var-file 옵션을 사용하여 지정할 수 있습니다.
    ```lua
    region          = "us-west-2"
    ami_id          = "ami-0c55b159cbfafe1f0"
    instance_type   = "t2.micro"
    ```

<br/>

## ⚙️ 구성 문법은 아래와 같습니다.

- data : 리소스가 아닌 데이터 소스(Data Source)를 정의하는 명령어입니다.

- module : 모듈(Module)을 정의하는 명령어입니다. 모듈은 재사용 가능한 코드 블록으로, 테라폼 코드를 더욱 모듈화하여 코드의 가독성과 유지보수성을 높일 수 있습니다.
    ```lua
    module "vpc" {
        # source 선언된 디렉토리 메인 코드의 호출하는데 사용됩니다.
        source = "terraform-aws-modules/vpc/aws"

        name                 = "example-vpc"
        cidr                 = "10.0.0.0/16"
        azs                  = ["us-west-2a", "us-west-2b"]
        public_subnets       = ["10.0.1.0/24", "10.0.2.0/24"]
        private_subnets      = ["10.0.10.0/24", "10.0.20.0/24"]
        enable_nat_gateway   = true
        single_nat_gateway   = true
        enable_dns_hostnames = true
    }
    ```
- provider : 사용할 클라우드 서비스 공급자(Provider)를 정의하는 명령어입니다. 예를 들어, AWS를 사용하는 경우 provider "aws" {}와 같이 작성합니다.
    
    ```lua
    provider "aws" {
        region = "us-west-2"
    }

    resource "aws_instance" "example" {
        ami           = "ami-0c55b159cbfafe1f0"
        instance_type = "t2.micro"
    }
    ```
  
- variable : 입력 변수(Variable)를 정의하는 명령어입니다. 예를 들어, 특정 AMI ID를 변수로 지정하여 EC2 인스턴스를 생성하는 경우 variable "ami_id" {}와 같이 작성합니다.

    ```lua
    variable "ami_id" {
        type        = string
        description = "AMI ID for EC2 instance"
    }

    resource "aws_instance" "example" {
        ami           = var.ami_id
        instance_type = "t2.micro"
    }
    ```

  
- output : 출력 변수(Output)를 정의하는 명령어입니다. 예를 들어, EC2 인스턴스의 IP 주소를 출력하는 경우 output "instance_ip" {}와 같이 작성합니다.
  
    ```lua
    resource "aws_instance" "example" {
        ami           = "ami-0c55b159cbfafe1f0"
        instance_type = "t2.micro"

        provisioner "local-exec" {
            command = "echo ${self.public_ip} > ip_address.txt"
        }
    }

    output "instance_ip" {
        value = aws_instance.example.public_ip
    }
    ```

## 🔗 여러가지의 아키텍처 정리

### 초안 1

    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    ├── backend.tf
    ├── env.tfvars
    ├── modules
    │   ├── vpc
    │   │   ├── main.tf
    │   │   ├── variables.tf
    │   │   ├── outputs.tf
    │   │   └── README.md
    │   ├── ec2
    │   │   ├── main.tf
    │   │   ├── variables.tf
    │   │   ├── outputs.tf
    │   │   └── README.md
    │   └── ...
    ├── data
    │   ├── example.tf
    │   └── ...
    └── README.md

### 초안 2

    ├── infra
    │   ├── rds
    │   │   ├── mariana_db
    │   │   │   ├── README.md
    │   │   │   ├── backend.tf
    │   │   │   ├── env-dev.tfvars
    │   │   │   ├── env-staging.tfvars
    │   │   │   ├── main.tf
    │   │   │   ├── terraform.tf
    │   │   │   └── variables.tf
    │   └── vpc
    │       ├── README.md
    │       ├── backend.tf
    │       ├── env-dev.tfvars
    │       ├── env-staging.tfvars
    │       ├── main.tf
    │       ├── terraform.tf
    │       └── variables.tf
    ├── modules
    │   ├── ec2
    │   │   ├── ec2.tf
    │   │   ├── main.tf
    │   │   ├── output.tf
    │   │   └── variables.tf
    │   ├── loadbalancer
    │   │   ├── main.tf
    │   │   └── variables.tf
    │   └── ...
    └── service
        ├── backend_example
        │   ├── README.md
        │   ├── alb.tf
        │   ├── ec2.tf
        │   ├── provider.tf
        │   ├── script.sh
        │   ├── terraform.tfvars
        │   └── variables.tf
        ├── frontend_example
        │    ├── README.md
        │    ├── backend.tf
        │    ├── env-dev.tfvars
        │    ├── env-prod.tfvars
        │    ├── env-stage.tfvars
        │    ├── main.tf
        │    ├── terraform.tf
        │    └── variables.tf
        │
        └── ...

## ✒️ 테라폼 실행 명령어는 다음과 같습니다.

```sh
terraform init      # 명령어를 사용하여 테라폼 설정을 초기화합니다.
terraform plan      # 명령어를 사용하여 인프라 변경사항을 검토합니다.
terraform apply     # 명령어를 사용하여 인프라 변경사항을 적용합니다.
terraform destroy   # 명령어를 사용하여 인프라를 제거합니다.
```

## 💙 소감

- 이상으로 테라폼(Terraform)에 대한 기본적인 내용과 테라폼 코드의 구조, 명령어 등에 대해 알아보았습니다. 

- 테라폼은 클라우드 인프라를 코드로 관리하고, 자동화된 인프라 배포를 가능케 해주는 강력한 도구입니다.


### 마지막으로 테라폼과 같이 쓰면 좋은것들 !


- Packer: 인프라를 위한 커스텀 이미지를 만들기 위한 도구입니다. Packer를 사용하면 인프라 리소스를 미리 설치하고 구성하여 커스텀 이미지를 생성할 수 있습니다.

- Vault: 보안 관리 도구로, 테라폼에서 사용되는 비밀 정보를 안전하게 관리할 수 있도록 도와줍니다.

- Atlantis: 테라폼 코드의 변경 사항을 버전 관리 시스템과 연동하여 자동화된 코드 검토를 제공하는 도구입니다.

- Terratest: 테라폼 코드의 단위 테스트를 위한 도구로, 테스트 코드를 작성하여 테라폼 코드 변경 사항이 프로덕션에 영향을 미치지 않도록 보장합니다.

이 외에도 다양한 테라폼과 관련된 도구들이 있습니다. 이들 도구들을 활용하면 테라폼을 더욱 효율적으로 사용할 수 있으며, 코드의 가독성과 유지보수성을 높일 수 있습니다.


감사합니다!


```toc

```