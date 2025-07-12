# Asobi 🚀

> **Work In Progress** - A CLI tool for developers to quickly spin up load-balanced EC2 servers for development/testing on AWS.

## Disclaimer

⚠️ **This tool is designed for development and testing environments, not production use.** It creates resources that may incur AWS charges.

## What is Asobi?

Asobi is a developer-friendly CLI tool that automates the creation of AWS infrastructure for development environments. It creates load-balanced EC2 instances, VPCs, security groups, and other necessary resources so you can focus on your code instead of infrastructure setup. It does so using the AWS SDK.

## Features

- 🏗️ **Quick Infrastructure Setup** - Create VPC, subnets, security groups, and load balancers with a single command
- ⚡ **Fast Development Environments** - Spin up load-balanced servers for easy testing/development
- 🗑️ **Easy Cleanup** - Tear down all resources with one command
- 🔧 **Flexible Configuration** - Support for different application types and custom configurations
- 🏷️ **Resource Tagging** - All resources are properly tagged for easy identification and cost tracking

## Prerequisites

- Node.js (v16 or higher)
- AWS CLI configured with appropriate credentials
- AWS account with permissions to create EC2, VPC, IAM, and ELB resources

## Installation

> The project is not yet published on NPM.

```bash
# Clone the repository
git clone https://github.com/ShivamBh/asobi.git
cd asobi

# Install dependencies
pnpm install

# Build the project
pnpm build

# Install globally (optional)
npm install -g .
```

## Quick Start

```bash
# Initialize a new asobi project
asobi init

# Create a new application
asobi create

# List all applications
asobi ls

# Check application status
asobi status <app-name>

# Delete an application
asobi delete <app-name>
```

## Usage

### Initialize a Project

```bash
asobi init
```

Creates a `.asobi` directory with configuration files in your current directory.

### Create an Application

```bash
# Create an empty application
asobi create

# Create with a specific codebase path
asobi create --path ./my-app

# Create a load-balanced web service
asobi create --type load-balanced-web-service --path ./my-app
```

### Application Types

- **`empty`** - Basic infrastructure without application deployment
- **`load-balanced-web-service`** - Load-balanced web service

### List Applications

```bash
# List all applications
asobi ls

# Get details for a specific application
asobi ls <app-name>
```

### Delete Applications

```bash
asobi delete <app-name>
```

Removes all AWS resources associated with the application.

## Configuration

Asobi uses a local configuration file at `.asobi/asobi.json` to track your project settings and deployed resources.

### AWS Credentials

Asobi will automatically detect AWS credentials from:

1. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
2. AWS CLI profiles
3. Interactive prompts if credentials are not found

## Architecture

Asobi creates the following AWS resources:

- **VPC** with public and private subnets
- **Internet Gateway** for public internet access
- **NAT Gateway** for private subnet internet access
- **Security Groups** with appropriate rules
- **Application Load Balancer** (for load-balanced services)
- **EC2 Instances** with auto-scaling groups
- **IAM Roles** and instance profiles
- **Route Tables** for proper networking

## Development Status

🚧 **This project is currently in active development**

### What's Working

- ✅ Basic CLI structure
- ✅ AWS service integrations (EC2, VPC, IAM, ALB)
- ✅ Infrastructure creation and deletion
- ✅ Configuration management
- ✅ Resource tagging

### What's In Progress

- 🔄 Application deployment and code synchronization
- 🔄 Status checking and monitoring
- 🔄 Error handling and retry mechanisms
- 🔄 Multi-region support
- 🔄 Default VPC use, or VPC of user's choosing(AWS has a limit of 5 VPCs per region)

### What's Planned

- 📋 Support for deploying application code to the EC2 instance
- 📋 Custom domain and SSL certificate management
- 📋 Environment variable management
- 📋 Better CLI status logging
- 📋 Updated docs with examples
- 📋 Manual delete paths for resources if the CLI fails to delete or rollback
- 📋 Lots of tests :(

## Contributing

This is a work-in-progress project. Contributions are welcome!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/yourusername/asobi/issues) page
2. Create a new issue with detailed information about your problem
3. Include AWS region, error messages, and steps to reproduce

---

**Made with ❤️ for developers who just want a running server on AWS without dealing with AWS**
