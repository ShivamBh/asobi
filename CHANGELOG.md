## [0.2.6](https://github.com/ShivamBh/asobi/compare/v0.2.5...v0.2.6) (2025-12-06)


### Bug Fixes

* removed redundant suffix ([ae16e59](https://github.com/ShivamBh/asobi/commit/ae16e598eb3715c3b03192df4e89fa5ef1740257))

## [0.2.5](https://github.com/ShivamBh/asobi/compare/v0.2.4...v0.2.5) (2025-12-06)


### Bug Fixes

* added ALB tests and fixtures ([798bc51](https://github.com/ShivamBh/asobi/commit/798bc51e3ae92d06a57a4cd11597a2f2017b5f89))

## [0.2.4](https://github.com/ShivamBh/asobi/compare/v0.2.3...v0.2.4) (2025-12-06)


### Bug Fixes

* added a try-catch block to handle error path for fetchLoadbalancer method ([875f499](https://github.com/ShivamBh/asobi/commit/875f4993adfe444131fac38fa2cdffdc68188ea9))
* removed unused CIDRService class from subnet dependencies and imports ([02c6a24](https://github.com/ShivamBh/asobi/commit/02c6a249932dc96e9fd12c0abe26019af6ce7c18))

## [0.2.3](https://github.com/ShivamBh/asobi/compare/v0.2.2...v0.2.3) (2025-12-02)


### Bug Fixes

* added missing attempt increments on failures to retry failed aws calls ([b175b26](https://github.com/ShivamBh/asobi/commit/b175b26cae5bb3e51c4bcf25f3d98bc71e3793f7))
* added prefixes, rethrow specific errors, move retry config to function args ([79a6cc9](https://github.com/ShivamBh/asobi/commit/79a6cc9e22b1f31762b1154e2f2c95ddfdc1e8ea))
* refactored deleteSecurityGroups into smaller functions ([7a3ba61](https://github.com/ShivamBh/asobi/commit/7a3ba61f752f735163b20341149ffa16573fc16b))
* used proper error code to propagate upwards ([501b7f7](https://github.com/ShivamBh/asobi/commit/501b7f74adead0ad2ac13ac3c97b3f053b49c0bb))

## [0.2.2](https://github.com/ShivamBh/asobi/compare/v0.2.1...v0.2.2) (2025-08-06)


### Bug Fixes

* check against resources map instead of just app name ([c75ccf2](https://github.com/ShivamBh/asobi/commit/c75ccf2017b00ef262983929d1fb63a7640c9d66))
* fixed config object creation for status and delete commands, refactored create command to setup default values ([e985be7](https://github.com/ShivamBh/asobi/commit/e985be7a0614a1d49afe4b9a7d4e19e7ebf06e2f))
* fixed loading env vars from env file before prompting user ([bfc02e6](https://github.com/ShivamBh/asobi/commit/bfc02e669ad0a9c9162b11cb7ab9113d2636f56a))

## [0.2.1](https://github.com/ShivamBh/asobi/compare/v0.2.0...v0.2.1) (2025-08-06)


### Bug Fixes

* added missing awaits messing up the config after deletion ([6e992b2](https://github.com/ShivamBh/asobi/commit/6e992b24cdb6eced508ddb11a1c3575c6b26582f))

# [0.2.0](https://github.com/ShivamBh/asobi/compare/v0.1.0...v0.2.0) (2025-07-25)


### Bug Fixes

* fixed typo on logs ([cdf180b](https://github.com/ShivamBh/asobi/commit/cdf180b563b21b2caa39a9d1477ba1d910b515cc))
* improved logging and reduced the waitTime for checking running state ([96b93b6](https://github.com/ShivamBh/asobi/commit/96b93b629a5349eab3bd7208ca848e76409633fc))
* mark default vpc ([ac7e441](https://github.com/ShivamBh/asobi/commit/ac7e4412e827d19a4bb7b6b3d9c40cc78ac7a5d2))
* return the subnet id ([93870a5](https://github.com/ShivamBh/asobi/commit/93870a57d8c2ebdeaf11124930aa7934b8cfb68c))
* skip vpc deletion if it's the default vpc of the region ([e0217fa](https://github.com/ShivamBh/asobi/commit/e0217fa59be1d46dfd8c42be991d57d69ec1fbd9))
* update types, removed arguments/options from commands for now and use harcoded values ([7644817](https://github.com/ShivamBh/asobi/commit/7644817cd9d940e83ef4e85d13c17b8a584642f7))


### Features

* added status command to fetch ec2, vpc and alb status with some metadata ([acf967b](https://github.com/ShivamBh/asobi/commit/acf967b765b13b9be2e5e91669589dfdf6bd0a13))
* handle creation and deletion of resources based around an existing vpc(instead of creating one) ([39f70ea](https://github.com/ShivamBh/asobi/commit/39f70eac815c34bc770518dfa5b3fbef1d93addf))
