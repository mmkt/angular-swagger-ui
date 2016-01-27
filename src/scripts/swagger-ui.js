/*
 * Orange angular-swagger-ui - v0.2.7
 *
 * (C) 2015 Orange, all right reserved
 * MIT Licensed
 */
'use strict';

angular
	.module('swaggerUi', ['ng', 'swaggerUiTemplates'])
	.directive('swaggerUi', ['$injector', function($injector) {

		return {
			restrict: 'A',
			controller: 'swaggerUiController',
			templateUrl: 'templates/swagger-ui.html',
			scope: {
				// Swagger descriptor URL (string, required)
				url: '=',
				// Swagger descriptor parser type (string, optional, default = "auto")
				// Built-in allowed values:
				// 		"auto": (default) parser is based on response Content-Type
				//		"json": force using JSON parser
				//
				//	More types could be defined by external modules
				parser: '@?',
				// Swagger descriptor loading indicator (variables, optional)
				loading: '=?',
				// Use permalinks? (boolean, optional, default = false)
				// If true and if using $routeProvider, should set 'reloadOnSearch: false' in route
				// configuration to avoid UI being rendered multiple times
				permalinks: '=?',
				// Display API explorer (boolean, optional, default = false)
				apiExplorer: '=?',
				// Error handler (function, optional)
				errorHandler: '=?',
				// Are Swagger descriptors loaded from trusted source only ? (boolean, optional, default = false)
				// If true, it avoids using ngSanitize but consider HTML as trusted so won't be cleaned
				trustedSources: '=?',
				// Allows defining a custom Swagger validator or disabling Swagger validation
				// If false, Swagger validation will be disabled
				// If URL, will be used as Swagger validator
				// If not defined, validator will be 'http://online.swagger.io/validator'
				validatorUrl: '@?'
			},
			link: function(scope) {
				// check parameters
				if (scope.permalinks && $injector.has('$route')) {
					var $route = $injector.get('$route');
					if ($route.current && $route.current.$$route && $route.current.$$route.reloadOnSearch) {
						console.warn('AngularSwaggerUI: when using permalinks you should set reloadOnSearch=false in your route config to avoid UI being rebuilt multiple times');
					}
				}
				if (!scope.trustedSources && !$injector.has('$sanitize')) {
					console.warn('AngularSwaggerUI: you must use ngSanitize OR set trusted-sources=true as directive param if swagger descriptors are loaded from trusted sources');
				}
				if (scope.validatorUrl === undefined) {
					scope.validatorUrl = 'http://online.swagger.io/validator';
				}
			}
		};
	}])
	.factory('swaggerUiBaseController', ['$http', '$location', '$q', 'swaggerClient', 'swaggerModules', 'swagger2JsonParser',
		function($http, $location, $q, swaggerClient, swaggerModules, swagger2JsonParser) {
			var SwaggerUiBaseController,
				bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

      SwaggerUiBaseController = (function() {
				function SwaggerUiBaseController(vm) {
					this.onError = bind(this.onError, this);
					this.expand = bind(this.expand, this);
					this.permalink = bind(this.permalink, this);
					this.submitExplorer = bind(this.submitExplorer, this);
					this.loadSwagger = bind(this.loadSwagger, this);
					this.swaggerLoaded = bind(this.swaggerLoaded, this);
					this.load = bind(this.load, this);
					this.swaggerParsed = bind(this.swaggerParsed, this);
					this.swagger = null;

					this.vm = vm;
					this.vm.expand = this.expand;
					this.vm.permalink = this.permalink;
          this.vm.submitExplorer = this.submitExplorer;

					// add default Swagger parser (JSON)
					swaggerModules.add(swaggerModules.PARSE, swagger2JsonParser);

				}

        SwaggerUiBaseController.prototype.onError = function() {

				};

				/**
				 * Load Swagger descriptor
				 */
        SwaggerUiBaseController.prototype.loadSwagger = function(url, callback) {
          var _this = this;
					this.vm.loading = true;
					var options = {
						method: 'GET',
						url: url
					};
					swaggerModules
						.execute(swaggerModules.BEFORE_LOAD, options)
						.then(function() {
							$http(options)
								.success(callback)
								.error(function(data, status) {
                  _this.onError({
										code: status,
										message: data
									});
								});
						})
						.catch(_this.onError);
				};

				/**
				 * Swagger descriptor has been loaded, launch parsing
				 */
        SwaggerUiBaseController.prototype.swaggerLoaded = function (swaggerUrl, swaggerType) {
          var _this = this;
          _this.vm.loading = false;
					var parseResult = {};
					// execute modules
          _this.vm.parser = _this.vm.parser || 'auto';
					swaggerModules
						.execute(
							swaggerModules.PARSE,
              _this.vm.parser,
							swaggerUrl,
							swaggerType,
              _this.swagger,
              _this.vm.trustedSources,
              parseResult
						)
						.then(function(executed) {
							if (executed) {
                _this.swaggerParsed(parseResult);
							} else {
                _this.onError({
									code: 415,
									message: 'no parser found for Swagger descriptor of type ' + swaggerType + ' and version ' + _this.swagger.swagger
								});
							}
						})
						.catch(_this.onError);
				};

				/**
				 * Swagger descriptor has parsed, launch display
				 */
        SwaggerUiBaseController.prototype.swaggerParsed = function (parseResult) {
          var _this = this;
					// execute modules
					swaggerModules
						.execute(swaggerModules.BEFORE_DISPLAY, parseResult)
						.then(function() {
							// display swagger UI
              _this.vm.infos = parseResult.infos;
              _this.vm.form = parseResult.form;
              _this.vm.resources = parseResult.resources;
						})
						.catch(_this.onError);
				};

        SwaggerUiBaseController.prototype.load = function (url) {
          var _this = this;
          _this.vm.infos = {};
          _this.vm.resources = [];
          _this.vm.form = {};
					if (url && url !== '') {
						if (_this.vm.loading) {
							//TODO cancel current loading swagger
						}
						// load Swagger descriptor
            _this.loadSwagger(url, function(data, status, headers) {
              _this.swagger = data;
							// execute modules
							swaggerModules
								.execute(swaggerModules.BEFORE_PARSE, url, _this.swagger)
								.then(function() {
									var contentType = headers()['content-type'] || 'application/json',
										swaggerType = contentType.split(';')[0];

                  _this.swaggerLoaded(url, swaggerType);
								})
								.catch(_this.onError);
						});
					}
				};

				/**
				 * show all resource's operations as list or as expanded list
				 */
        SwaggerUiBaseController.prototype.expand = function(resource, expandOperations) {
					resource.open = true;
					for (var i = 0, op = resource.operations, l = op.length; i < l; i++) {
						op[i].open = expandOperations;
					}
				};

				/**
				 * show all resource's operations as list or as expanded list
				 */
        SwaggerUiBaseController.prototype.permalink = function(name) {
					if (this.vm.permalinks) {
						$location.search('swagger', name);
					}
				};

				/**
				 * show all resource's operations as list or as expanded list
				 */
        SwaggerUiBaseController.prototype.submitExplorer = function(operation) {
					operation.loading = true;
					swaggerClient
						.send(this.swagger, operation, this.vm.form[operation.id])
						.then(function(result) {
							operation.loading = false;
							operation.explorerResult = result;
						});
				};

				return SwaggerUiBaseController;

			})();

			return SwaggerUiBaseController;
		}
	])
	.controller('swaggerUiController', ['$scope', 'swaggerUiBaseController',
		function($scope, SwaggerUiBaseController) {

			var onError = function (error) {
				$scope.loading = false;
				if (typeof $scope.errorHandler === 'function') {
					$scope.errorHandler(error.message, error.code);
				} else {
					console.error(error.code, 'AngularSwaggerUI: ' + error.message);
				}
			};

			var controller = new SwaggerUiBaseController($scope);
      controller.onError = onError;

			$scope.$watch('url', function(url) {
        if (url) {
          controller.load(url);
        }
			});
		}
	])
	.directive('fileInput', function() {
		// helper to be able to retrieve HTML5 File in ngModel from input
		return {
			restrict: 'A',
			require: 'ngModel',
			link: function(scope, element, attr, ngModel) {
				element.bind('change', function() {
					scope.$apply(function() {
						//TODO manage multiple files ?
						ngModel.$setViewValue(element[0].files[0]);
					});
				});
			}
		};
	});