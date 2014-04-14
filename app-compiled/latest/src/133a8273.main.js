(function () {/**
 * @license almond 0.2.9 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                name = baseParts.concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("almond", function(){});

/**
 * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
 *
 * @version 1.0.1
 * @codingstandard ftlabs-jsv2
 * @copyright The Financial Times Limited [All Rights Reserved]
 * @license MIT License (see LICENSE.txt)
 */

/*jslint browser:true, node:true*/
/*global define, Event, Node*/


/**
 * Instantiate fast-clicking listeners on the specificed layer.
 *
 * @constructor
 * @param {Element} layer The layer to listen on
 * @param {Object} options The options to override the defaults
 */
function FastClick(layer, options) {
	
	var oldOnClick;

	options = options || {};

	/**
	 * Whether a click is currently being tracked.
	 *
	 * @type boolean
	 */
	this.trackingClick = false;


	/**
	 * Timestamp for when click tracking started.
	 *
	 * @type number
	 */
	this.trackingClickStart = 0;


	/**
	 * The element being tracked for a click.
	 *
	 * @type EventTarget
	 */
	this.targetElement = null;


	/**
	 * X-coordinate of touch start event.
	 *
	 * @type number
	 */
	this.touchStartX = 0;


	/**
	 * Y-coordinate of touch start event.
	 *
	 * @type number
	 */
	this.touchStartY = 0;


	/**
	 * ID of the last touch, retrieved from Touch.identifier.
	 *
	 * @type number
	 */
	this.lastTouchIdentifier = 0;


	/**
	 * Touchmove boundary, beyond which a click will be cancelled.
	 *
	 * @type number
	 */
	this.touchBoundary = options.touchBoundary || 10;


	/**
	 * The FastClick layer.
	 *
	 * @type Element
	 */
	this.layer = layer;

	/**
	 * The minimum time between tap(touchstart and touchend) events
	 *
	 * @type number
	 */
	this.tapDelay = options.tapDelay || 200;

	if (FastClick.notNeeded(layer)) {
		return;
	}

	// Some old versions of Android don't have Function.prototype.bind
	function bind(method, context) {
		return function() { return method.apply(context, arguments); };
	}


	var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
	var context = this;
	for (var i = 0, l = methods.length; i < l; i++) {
		context[methods[i]] = bind(context[methods[i]], context);
	}

	// Set up event handlers as required
	if (deviceIsAndroid) {
		layer.addEventListener('mouseover', this.onMouse, true);
		layer.addEventListener('mousedown', this.onMouse, true);
		layer.addEventListener('mouseup', this.onMouse, true);
	}

	layer.addEventListener('click', this.onClick, true);
	layer.addEventListener('touchstart', this.onTouchStart, false);
	layer.addEventListener('touchmove', this.onTouchMove, false);
	layer.addEventListener('touchend', this.onTouchEnd, false);
	layer.addEventListener('touchcancel', this.onTouchCancel, false);

	// Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
	// which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
	// layer when they are cancelled.
	if (!Event.prototype.stopImmediatePropagation) {
		layer.removeEventListener = function(type, callback, capture) {
			var rmv = Node.prototype.removeEventListener;
			if (type === 'click') {
				rmv.call(layer, type, callback.hijacked || callback, capture);
			} else {
				rmv.call(layer, type, callback, capture);
			}
		};

		layer.addEventListener = function(type, callback, capture) {
			var adv = Node.prototype.addEventListener;
			if (type === 'click') {
				adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
					if (!event.propagationStopped) {
						callback(event);
					}
				}), capture);
			} else {
				adv.call(layer, type, callback, capture);
			}
		};
	}

	// If a handler is already declared in the element's onclick attribute, it will be fired before
	// FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
	// adding it as listener.
	if (typeof layer.onclick === 'function') {

		// Android browser on at least 3.2 requires a new reference to the function in layer.onclick
		// - the old one won't work if passed to addEventListener directly.
		oldOnClick = layer.onclick;
		layer.addEventListener('click', function(event) {
			oldOnClick(event);
		}, false);
		layer.onclick = null;
	}
}


/**
 * Android requires exceptions.
 *
 * @type boolean
 */
var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0;


/**
 * iOS requires exceptions.
 *
 * @type boolean
 */
var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent);


/**
 * iOS 4 requires an exception for select elements.
 *
 * @type boolean
 */
var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


/**
 * iOS 6.0(+?) requires the target element to be manually derived
 *
 * @type boolean
 */
var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS ([6-9]|\d{2})_\d/).test(navigator.userAgent);


/**
 * Determine whether a given element requires a native click.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element needs a native click
 */
FastClick.prototype.needsClick = function(target) {
	
	switch (target.nodeName.toLowerCase()) {

	// Don't send a synthetic click to disabled inputs (issue #62)
	case 'button':
	case 'select':
	case 'textarea':
		if (target.disabled) {
			return true;
		}

		break;
	case 'input':

		// File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
		if ((deviceIsIOS && target.type === 'file') || target.disabled) {
			return true;
		}

		break;
	case 'label':
	case 'video':
		return true;
	}

	return (/\bneedsclick\b/).test(target.className);
};


/**
 * Determine whether a given element requires a call to focus to simulate click into element.
 *
 * @param {EventTarget|Element} target Target DOM element
 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
 */
FastClick.prototype.needsFocus = function(target) {
	
	switch (target.nodeName.toLowerCase()) {
	case 'textarea':
		return true;
	case 'select':
		return !deviceIsAndroid;
	case 'input':
		switch (target.type) {
		case 'button':
		case 'checkbox':
		case 'file':
		case 'image':
		case 'radio':
		case 'submit':
			return false;
		}

		// No point in attempting to focus disabled inputs
		return !target.disabled && !target.readOnly;
	default:
		return (/\bneedsfocus\b/).test(target.className);
	}
};


/**
 * Send a click event to the specified element.
 *
 * @param {EventTarget|Element} targetElement
 * @param {Event} event
 */
FastClick.prototype.sendClick = function(targetElement, event) {
	
	var clickEvent, touch;

	// On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
	if (document.activeElement && document.activeElement !== targetElement) {
		document.activeElement.blur();
	}

	touch = event.changedTouches[0];

	// Synthesise a click event, with an extra attribute so it can be tracked
	clickEvent = document.createEvent('MouseEvents');
	clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
	clickEvent.forwardedTouchEvent = true;
	targetElement.dispatchEvent(clickEvent);
};

FastClick.prototype.determineEventType = function(targetElement) {
	

	//Issue #159: Android Chrome Select Box does not open with a synthetic click event
	if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
		return 'mousedown';
	}

	return 'click';
};


/**
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.focus = function(targetElement) {
	
	var length;

	// Issue #160: on iOS 7, some input elements (e.g. date datetime) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
	if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time') {
		length = targetElement.value.length;
		targetElement.setSelectionRange(length, length);
	} else {
		targetElement.focus();
	}
};


/**
 * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
 *
 * @param {EventTarget|Element} targetElement
 */
FastClick.prototype.updateScrollParent = function(targetElement) {
	
	var scrollParent, parentElement;

	scrollParent = targetElement.fastClickScrollParent;

	// Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
	// target element was moved to another parent.
	if (!scrollParent || !scrollParent.contains(targetElement)) {
		parentElement = targetElement;
		do {
			if (parentElement.scrollHeight > parentElement.offsetHeight) {
				scrollParent = parentElement;
				targetElement.fastClickScrollParent = parentElement;
				break;
			}

			parentElement = parentElement.parentElement;
		} while (parentElement);
	}

	// Always update the scroll top tracker if possible.
	if (scrollParent) {
		scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
	}
};


/**
 * @param {EventTarget} targetElement
 * @returns {Element|EventTarget}
 */
FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {
	

	// On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
	if (eventTarget.nodeType === Node.TEXT_NODE) {
		return eventTarget.parentNode;
	}

	return eventTarget;
};


/**
 * On touch start, record the position and scroll offset.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchStart = function(event) {
	
	var targetElement, touch, selection;

	// Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
	if (event.targetTouches.length > 1) {
		return true;
	}

	targetElement = this.getTargetElementFromEventTarget(event.target);
	touch = event.targetTouches[0];

	if (deviceIsIOS) {

		// Only trusted events will deselect text on iOS (issue #49)
		selection = window.getSelection();
		if (selection.rangeCount && !selection.isCollapsed) {
			return true;
		}

		if (!deviceIsIOS4) {

			// Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
			// when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
			// with the same identifier as the touch event that previously triggered the click that triggered the alert.
			// Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
			// immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
			if (touch.identifier === this.lastTouchIdentifier) {
				event.preventDefault();
				return false;
			}

			this.lastTouchIdentifier = touch.identifier;

			// If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
			// 1) the user does a fling scroll on the scrollable layer
			// 2) the user stops the fling scroll with another tap
			// then the event.target of the last 'touchend' event will be the element that was under the user's finger
			// when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
			// is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
			this.updateScrollParent(targetElement);
		}
	}

	this.trackingClick = true;
	this.trackingClickStart = event.timeStamp;
	this.targetElement = targetElement;

	this.touchStartX = touch.pageX;
	this.touchStartY = touch.pageY;

	// Prevent phantom clicks on fast double-tap (issue #36)
	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		event.preventDefault();
	}

	return true;
};


/**
 * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.touchHasMoved = function(event) {
	
	var touch = event.changedTouches[0], boundary = this.touchBoundary;

	if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
		return true;
	}

	return false;
};


/**
 * Update the last position.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchMove = function(event) {
	
	if (!this.trackingClick) {
		return true;
	}

	// If the touch has moved, cancel the click tracking
	if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
		this.trackingClick = false;
		this.targetElement = null;
	}

	return true;
};


/**
 * Attempt to find the labelled control for the given label element.
 *
 * @param {EventTarget|HTMLLabelElement} labelElement
 * @returns {Element|null}
 */
FastClick.prototype.findControl = function(labelElement) {
	

	// Fast path for newer browsers supporting the HTML5 control attribute
	if (labelElement.control !== undefined) {
		return labelElement.control;
	}

	// All browsers under test that support touch events also support the HTML5 htmlFor attribute
	if (labelElement.htmlFor) {
		return document.getElementById(labelElement.htmlFor);
	}

	// If no for attribute exists, attempt to retrieve the first labellable descendant element
	// the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
	return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
};


/**
 * On touch end, determine whether to send a click event at once.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onTouchEnd = function(event) {
	
	var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

	if (!this.trackingClick) {
		return true;
	}

	// Prevent phantom clicks on fast double-tap (issue #36)
	if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
		this.cancelNextClick = true;
		return true;
	}

	// Reset to prevent wrong click cancel on input (issue #156).
	this.cancelNextClick = false;

	this.lastClickTime = event.timeStamp;

	trackingClickStart = this.trackingClickStart;
	this.trackingClick = false;
	this.trackingClickStart = 0;

	// On some iOS devices, the targetElement supplied with the event is invalid if the layer
	// is performing a transition or scroll, and has to be re-detected manually. Note that
	// for this to function correctly, it must be called *after* the event target is checked!
	// See issue #57; also filed as rdar://13048589 .
	if (deviceIsIOSWithBadTarget) {
		touch = event.changedTouches[0];

		// In certain cases arguments of elementFromPoint can be negative, so prevent setting targetElement to null
		targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
		targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
	}

	targetTagName = targetElement.tagName.toLowerCase();
	if (targetTagName === 'label') {
		forElement = this.findControl(targetElement);
		if (forElement) {
			this.focus(targetElement);
			if (deviceIsAndroid) {
				return false;
			}

			targetElement = forElement;
		}
	} else if (this.needsFocus(targetElement)) {

		// Case 1: If the touch started a while ago (best guess is 100ms based on tests for issue #36) then focus will be triggered anyway. Return early and unset the target element reference so that the subsequent click will be allowed through.
		// Case 2: Without this exception for input elements tapped when the document is contained in an iframe, then any inputted text won't be visible even though the value attribute is updated as the user types (issue #37).
		if ((event.timeStamp - trackingClickStart) > 100 || (deviceIsIOS && window.top !== window && targetTagName === 'input')) {
			this.targetElement = null;
			return false;
		}

		this.focus(targetElement);
		this.sendClick(targetElement, event);

		// Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
		// Also this breaks opening selects when VoiceOver is active on iOS6, iOS7 (and possibly others)
		if (!deviceIsIOS || targetTagName !== 'select') {
			this.targetElement = null;
			event.preventDefault();
		}

		return false;
	}

	if (deviceIsIOS && !deviceIsIOS4) {

		// Don't send a synthetic click event if the target element is contained within a parent layer that was scrolled
		// and this tap is being used to stop the scrolling (usually initiated by a fling - issue #42).
		scrollParent = targetElement.fastClickScrollParent;
		if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
			return true;
		}
	}

	// Prevent the actual click from going though - unless the target node is marked as requiring
	// real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
	if (!this.needsClick(targetElement)) {
		event.preventDefault();
		this.sendClick(targetElement, event);
	}

	return false;
};


/**
 * On touch cancel, stop tracking the click.
 *
 * @returns {void}
 */
FastClick.prototype.onTouchCancel = function() {
	
	this.trackingClick = false;
	this.targetElement = null;
};


/**
 * Determine mouse events which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onMouse = function(event) {
	

	// If a target element was never set (because a touch event was never fired) allow the event
	if (!this.targetElement) {
		return true;
	}

	if (event.forwardedTouchEvent) {
		return true;
	}

	// Programmatically generated events targeting a specific element should be permitted
	if (!event.cancelable) {
		return true;
	}

	// Derive and check the target element to see whether the mouse event needs to be permitted;
	// unless explicitly enabled, prevent non-touch click events from triggering actions,
	// to prevent ghost/doubleclicks.
	if (!this.needsClick(this.targetElement) || this.cancelNextClick) {

		// Prevent any user-added listeners declared on FastClick element from being fired.
		if (event.stopImmediatePropagation) {
			event.stopImmediatePropagation();
		} else {

			// Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
			event.propagationStopped = true;
		}

		// Cancel the event
		event.stopPropagation();
		event.preventDefault();

		return false;
	}

	// If the mouse event is permitted, return true for the action to go through.
	return true;
};


/**
 * On actual clicks, determine whether this is a touch-generated click, a click action occurring
 * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
 * an actual click which should be permitted.
 *
 * @param {Event} event
 * @returns {boolean}
 */
FastClick.prototype.onClick = function(event) {
	
	var permitted;

	// It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
	if (this.trackingClick) {
		this.targetElement = null;
		this.trackingClick = false;
		return true;
	}

	// Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
	if (event.target.type === 'submit' && event.detail === 0) {
		return true;
	}

	permitted = this.onMouse(event);

	// Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
	if (!permitted) {
		this.targetElement = null;
	}

	// If clicks are permitted, return true for the action to go through.
	return permitted;
};


/**
 * Remove all FastClick's event listeners.
 *
 * @returns {void}
 */
FastClick.prototype.destroy = function() {
	
	var layer = this.layer;

	if (deviceIsAndroid) {
		layer.removeEventListener('mouseover', this.onMouse, true);
		layer.removeEventListener('mousedown', this.onMouse, true);
		layer.removeEventListener('mouseup', this.onMouse, true);
	}

	layer.removeEventListener('click', this.onClick, true);
	layer.removeEventListener('touchstart', this.onTouchStart, false);
	layer.removeEventListener('touchmove', this.onTouchMove, false);
	layer.removeEventListener('touchend', this.onTouchEnd, false);
	layer.removeEventListener('touchcancel', this.onTouchCancel, false);
};


/**
 * Check whether FastClick is needed.
 *
 * @param {Element} layer The layer to listen on
 */
FastClick.notNeeded = function(layer) {
	
	var metaViewport;
	var chromeVersion;

	// Devices that don't support touch don't need FastClick
	if (typeof window.ontouchstart === 'undefined') {
		return true;
	}

	// Chrome version - zero for other browsers
	chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

	if (chromeVersion) {

		if (deviceIsAndroid) {
			metaViewport = document.querySelector('meta[name=viewport]');

			if (metaViewport) {
				// Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
				if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
					return true;
				}
				// Chrome 32 and above with width=device-width or less don't need FastClick
				if (chromeVersion > 31 && window.innerWidth <= window.screen.width) {
					return true;
				}
			}

		// Chrome desktop doesn't need FastClick (issue #15)
		} else {
			return true;
		}
	}

	// IE10 with -ms-touch-action: none, which disables double-tap-to-zoom (issue #97)
	if (layer.style.msTouchAction === 'none') {
		return true;
	}

	return false;
};


/**
 * Factory method for creating a FastClick object
 *
 * @param {Element} layer The layer to listen on
 * @param {Object} options The options to override the defaults
 */
FastClick.attach = function(layer, options) {
	
	return new FastClick(layer, options);
};


if (typeof define !== 'undefined' && define.amd) {

	// AMD. Register as an anonymous module.
	define('fastclick',[],function() {
		
		return FastClick;
	});
} else if (typeof module !== 'undefined' && module.exports) {
	module.exports = FastClick.attach;
	module.exports.FastClick = FastClick;
} else {
	window.FastClick = FastClick;
}
;
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Entity',['require','exports','module'],function(require, exports, module) {
    /**
     * A singleton that maintains a global registry of Surfaces.
     *   Private.
     *
     * @private
     * @static
     * @class Entity
     */

    var entities = [];

    /**
     * Get entity from global index.
     *
     * @private
     * @method get
     * @param {Number} id entity reigstration id
     * @return {Surface} entity in the global index
     */
    function get(id) {
        return entities[id];
    }

    /**
     * Overwrite entity in the global index
     *
     * @private
     * @method set
     * @param {Number} id entity reigstration id
     * @return {Surface} entity to add to the global index
     */
    function set(id, entity) {
        entities[id] = entity;
    }

    /**
     * Add entity to global index
     *
     * @private
     * @method register
     * @param {Surface} entity to add to global index
     * @return {Number} new id
     */
    function register(entity) {
        var id = entities.length;
        set(id, entity);
        return id;
    }

    /**
     * Remove entity from global index
     *
     * @private
     * @method unregister
     * @param {Number} id entity reigstration id
     */
    function unregister(id) {
        set(id, null);
    }

    module.exports = {
        register: register,
        unregister: unregister,
        get: get,
        set: set
    };
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Transform',['require','exports','module'],function(require, exports, module) {

    /**
     *  A high-performance static matrix math library used to calculate
     *    affine transforms on surfaces and other renderables.
     *    Famo.us uses 4x4 matrices corresponding directly to
     *    WebKit matrices (column-major order).
     *
     *    The internal "type" of a Matrix is a 16-long float array in
     *    row-major order, with:
     *    elements [0],[1],[2],[4],[5],[6],[8],[9],[10] forming the 3x3
     *          transformation matrix;
     *    elements [12], [13], [14] corresponding to the t_x, t_y, t_z
     *           translation;
     *    elements [3], [7], [11] set to 0;
     *    element [15] set to 1.
     *    All methods are static.
     *
     * @static
     *
     * @class Transform
     */
    var Transform = {};

    // WARNING: these matrices correspond to WebKit matrices, which are
    //    transposed from their math counterparts
    Transform.precision = 1e-6;
    Transform.identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

    /**
     * Multiply two or more Transform matrix types to return a Transform matrix.
     *
     * @method multiply4x4
     * @static
     * @param {Transform} a left matrix
     * @param {Transform} b right matrix
     * @return {Transform} the resulting matrix
     */
    Transform.multiply4x4 = function multiply4x4(a, b) {
        return [
            a[0] * b[0] + a[4] * b[1] + a[8] * b[2] + a[12] * b[3],
            a[1] * b[0] + a[5] * b[1] + a[9] * b[2] + a[13] * b[3],
            a[2] * b[0] + a[6] * b[1] + a[10] * b[2] + a[14] * b[3],
            a[3] * b[0] + a[7] * b[1] + a[11] * b[2] + a[15] * b[3],
            a[0] * b[4] + a[4] * b[5] + a[8] * b[6] + a[12] * b[7],
            a[1] * b[4] + a[5] * b[5] + a[9] * b[6] + a[13] * b[7],
            a[2] * b[4] + a[6] * b[5] + a[10] * b[6] + a[14] * b[7],
            a[3] * b[4] + a[7] * b[5] + a[11] * b[6] + a[15] * b[7],
            a[0] * b[8] + a[4] * b[9] + a[8] * b[10] + a[12] * b[11],
            a[1] * b[8] + a[5] * b[9] + a[9] * b[10] + a[13] * b[11],
            a[2] * b[8] + a[6] * b[9] + a[10] * b[10] + a[14] * b[11],
            a[3] * b[8] + a[7] * b[9] + a[11] * b[10] + a[15] * b[11],
            a[0] * b[12] + a[4] * b[13] + a[8] * b[14] + a[12] * b[15],
            a[1] * b[12] + a[5] * b[13] + a[9] * b[14] + a[13] * b[15],
            a[2] * b[12] + a[6] * b[13] + a[10] * b[14] + a[14] * b[15],
            a[3] * b[12] + a[7] * b[13] + a[11] * b[14] + a[15] * b[15]
        ];
    };

    /**
     * Fast-multiply two or more Transform matrix types to return a
     *    Matrix, assuming bottom row on each is [0 0 0 1].
     *
     * @method multiply
     * @static
     * @param {Transform} a left matrix
     * @param {Transform} b right matrix
     * @return {Transform} the resulting matrix
     */
    Transform.multiply = function multiply(a, b) {
        return [
            a[0] * b[0] + a[4] * b[1] + a[8] * b[2],
            a[1] * b[0] + a[5] * b[1] + a[9] * b[2],
            a[2] * b[0] + a[6] * b[1] + a[10] * b[2],
            0,
            a[0] * b[4] + a[4] * b[5] + a[8] * b[6],
            a[1] * b[4] + a[5] * b[5] + a[9] * b[6],
            a[2] * b[4] + a[6] * b[5] + a[10] * b[6],
            0,
            a[0] * b[8] + a[4] * b[9] + a[8] * b[10],
            a[1] * b[8] + a[5] * b[9] + a[9] * b[10],
            a[2] * b[8] + a[6] * b[9] + a[10] * b[10],
            0,
            a[0] * b[12] + a[4] * b[13] + a[8] * b[14] + a[12],
            a[1] * b[12] + a[5] * b[13] + a[9] * b[14] + a[13],
            a[2] * b[12] + a[6] * b[13] + a[10] * b[14] + a[14],
            1
        ];
    };

    /**
     * Return a Transform translated by additional amounts in each
     *    dimension. This is equivalent to the result of
     *
     *    Matrix.multiply(Matrix.translate(t[0], t[1], t[2]), m).
     *
     * @method thenMove
     * @static
     * @param {Transform} m a matrix
     * @param {Array.Number} t floats delta vector of length 2 or 3
     * @return {Transform} the resulting translated matrix
     */
    Transform.thenMove = function thenMove(m, t) {
        if (!t[2]) t[2] = 0;
        return [m[0], m[1], m[2], 0, m[4], m[5], m[6], 0, m[8], m[9], m[10], 0, m[12] + t[0], m[13] + t[1], m[14] + t[2], 1];
    };

    /**
     * Return a Transform atrix which represents the result of a transform matrix
     *    applied after a move. This is faster than the equivalent multiply.
     *    This is equivalent to the result of:
     *
     *    Transform.multiply(m, Transform.translate(t[0], t[1], t[2])).
     *
     * @method moveThen
     * @static
     * @param {Array.Number} v vector representing initial movement
     * @param {Transform} m matrix to apply afterwards
     * @return {Transform} the resulting matrix
     */
    Transform.moveThen = function moveThen(v, m) {
        if (!v[2]) v[2] = 0;
        var t0 = v[0] * m[0] + v[1] * m[4] + v[2] * m[8];
        var t1 = v[0] * m[1] + v[1] * m[5] + v[2] * m[9];
        var t2 = v[0] * m[2] + v[1] * m[6] + v[2] * m[10];
        return Transform.thenMove(m, [t0, t1, t2]);
    };

    /**
     * Return a Transform which represents a translation by specified
     *    amounts in each dimension.
     *
     * @method translate
     * @static
     * @param {Number} x x translation
     * @param {Number} y y translation
     * @param {Number} z z translation
     * @return {Transform} the resulting matrix
     */
    Transform.translate = function translate(x, y, z) {
        if (z === undefined) z = 0;
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
    };

    /**
     * Return a Transform scaled by a vector in each
     *    dimension. This is a more performant equivalent to the result of
     *
     *    Transform.multiply(Transform.scale(s[0], s[1], s[2]), m).
     *
     * @method thenScale
     * @static
     * @param {Transform} m a matrix
     * @param {Array.Number} s delta vector (array of floats &&
     *    array.length == 3)
     * @return {Transform} the resulting translated matrix
     */
    Transform.thenScale = function thenScale(m, s) {
        return [
            s[0] * m[0], s[1] * m[1], s[2] * m[2], 0,
            s[0] * m[4], s[1] * m[5], s[2] * m[6], 0,
            s[0] * m[8], s[1] * m[9], s[2] * m[10], 0,
            s[0] * m[12], s[1] * m[13], s[2] * m[14], 1
        ];
    };

    /**
     * Return a Transform which represents a scale by specified amounts
     *    in each dimension.
     *
     * @method scale
     * @static
     * @param {Number} x x scale factor
     * @param {Number} y y scale factor
     * @param {Number} z z scale factor
     * @return {Transform} the resulting matrix
     */
    Transform.scale = function scale(x, y, z) {
        if (z === undefined) z = 1;
        return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
    };

    /**
     * Return a Transform which represents a clockwise
     *    rotation around the x axis.
     *
     * @method rotateX
     * @static
     * @param {Number} theta radians
     * @return {Transform} the resulting matrix
     */
    Transform.rotateX = function rotateX(theta) {
        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);
        return [1, 0, 0, 0, 0, cosTheta, sinTheta, 0, 0, -sinTheta, cosTheta, 0, 0, 0, 0, 1];
    };

    /**
     * Return a Transform which represents a clockwise
     *    rotation around the y axis.
     *
     * @method rotateY
     * @static
     * @param {Number} theta radians
     * @return {Transform} the resulting matrix
     */
    Transform.rotateY = function rotateY(theta) {
        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);
        return [cosTheta, 0, -sinTheta, 0, 0, 1, 0, 0, sinTheta, 0, cosTheta, 0, 0, 0, 0, 1];
    };

    /**
     * Return a Transform which represents a clockwise
     *    rotation around the z axis.
     *
     * @method rotateZ
     * @static
     * @param {Number} theta radians
     * @return {Transform} the resulting matrix
     */
    Transform.rotateZ = function rotateZ(theta) {
        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);
        return [cosTheta, sinTheta, 0, 0, -sinTheta, cosTheta, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    };

    /**
     * Return a Transform which represents composed clockwise
     *    rotations along each of the axes. Equivalent to the result of
     *    Matrix.multiply(rotateX(phi), rotateY(theta), rotateZ(psi)).
     *
     * @method rotate
     * @static
     * @param {Number} phi radians to rotate about the positive x axis
     * @param {Number} theta radians to rotate about the positive y axis
     * @param {Number} psi radians to rotate about the positive z axis
     * @return {Transform} the resulting matrix
     */
    Transform.rotate = function rotate(phi, theta, psi) {
        var cosPhi = Math.cos(phi);
        var sinPhi = Math.sin(phi);
        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);
        var cosPsi = Math.cos(psi);
        var sinPsi = Math.sin(psi);
        var result = [
            cosTheta * cosPsi,
            cosPhi * sinPsi + sinPhi * sinTheta * cosPsi,
            sinPhi * sinPsi - cosPhi * sinTheta * cosPsi,
            0,
            -cosTheta * sinPsi,
            cosPhi * cosPsi - sinPhi * sinTheta * sinPsi,
            sinPhi * cosPsi + cosPhi * sinTheta * sinPsi,
            0,
            sinTheta,
            -sinPhi * cosTheta,
            cosPhi * cosTheta,
            0,
            0, 0, 0, 1
        ];
        return result;
    };

    /**
     * Return a Transform which represents an axis-angle rotation
     *
     * @method rotateAxis
     * @static
     * @param {Array.Number} v unit vector representing the axis to rotate about
     * @param {Number} theta radians to rotate clockwise about the axis
     * @return {Transform} the resulting matrix
     */
    Transform.rotateAxis = function rotateAxis(v, theta) {
        var sinTheta = Math.sin(theta);
        var cosTheta = Math.cos(theta);
        var verTheta = 1 - cosTheta; // versine of theta

        var xxV = v[0] * v[0] * verTheta;
        var xyV = v[0] * v[1] * verTheta;
        var xzV = v[0] * v[2] * verTheta;
        var yyV = v[1] * v[1] * verTheta;
        var yzV = v[1] * v[2] * verTheta;
        var zzV = v[2] * v[2] * verTheta;
        var xs = v[0] * sinTheta;
        var ys = v[1] * sinTheta;
        var zs = v[2] * sinTheta;

        var result = [
            xxV + cosTheta, xyV + zs, xzV - ys, 0,
            xyV - zs, yyV + cosTheta, yzV + xs, 0,
            xzV + ys, yzV - xs, zzV + cosTheta, 0,
            0, 0, 0, 1
        ];
        return result;
    };

    /**
     * Return a Transform which represents a transform matrix applied about
     * a separate origin point.
     *
     * @method aboutOrigin
     * @static
     * @param {Array.Number} v origin point to apply matrix
     * @param {Transform} m matrix to apply
     * @return {Transform} the resulting matrix
     */
    Transform.aboutOrigin = function aboutOrigin(v, m) {
        var t0 = v[0] - (v[0] * m[0] + v[1] * m[4] + v[2] * m[8]);
        var t1 = v[1] - (v[0] * m[1] + v[1] * m[5] + v[2] * m[9]);
        var t2 = v[2] - (v[0] * m[2] + v[1] * m[6] + v[2] * m[10]);
        return Transform.thenMove(m, [t0, t1, t2]);
    };

    /**
     * Return a Transform representation of a skew transformation
     *
     * @method skew
     * @static
     * @param {Number} phi scale factor skew in the x axis
     * @param {Number} theta scale factor skew in the y axis
     * @param {Number} psi scale factor skew in the z axis
     * @return {Transform} the resulting matrix
     */
    Transform.skew = function skew(phi, theta, psi) {
        return [1, 0, 0, 0, Math.tan(psi), 1, 0, 0, Math.tan(theta), Math.tan(phi), 1, 0, 0, 0, 0, 1];
    };

    /**
     * Returns a perspective Transform matrix
     *
     * @method perspective
     * @static
     * @param {Number} focusZ z position of focal point
     * @return {Transform} the resulting matrix
     */
    Transform.perspective = function perspective(focusZ) {
        return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / focusZ, 0, 0, 0, 1];
    };

    /**
     * Return translation vector component of given Transform
     *
     * @method getTranslate
     * @static
     * @param {Transform} m matrix
     * @return {Array.Number} the translation vector [t_x, t_y, t_z]
     */
    Transform.getTranslate = function getTranslate(m) {
        return [m[12], m[13], m[14]];
    };

    /**
     * Return inverse affine matrix for given Transform.
     *   Note: This assumes m[3] = m[7] = m[11] = 0, and m[15] = 1.
     *   Will provide incorrect results if not invertible or preconditions not met.
     *
     * @method inverse
     * @static
     * @param {Transform} m matrix
     * @return {Transform} the resulting inverted matrix
     */
    Transform.inverse = function inverse(m) {
        // only need to consider 3x3 section for affine
        var c0 = m[5] * m[10] - m[6] * m[9];
        var c1 = m[4] * m[10] - m[6] * m[8];
        var c2 = m[4] * m[9] - m[5] * m[8];
        var c4 = m[1] * m[10] - m[2] * m[9];
        var c5 = m[0] * m[10] - m[2] * m[8];
        var c6 = m[0] * m[9] - m[1] * m[8];
        var c8 = m[1] * m[6] - m[2] * m[5];
        var c9 = m[0] * m[6] - m[2] * m[4];
        var c10 = m[0] * m[5] - m[1] * m[4];
        var detM = m[0] * c0 - m[1] * c1 + m[2] * c2;
        var invD = 1 / detM;
        var result = [
            invD * c0, -invD * c4, invD * c8, 0,
            -invD * c1, invD * c5, -invD * c9, 0,
            invD * c2, -invD * c6, invD * c10, 0,
            0, 0, 0, 1
        ];
        result[12] = -m[12] * result[0] - m[13] * result[4] - m[14] * result[8];
        result[13] = -m[12] * result[1] - m[13] * result[5] - m[14] * result[9];
        result[14] = -m[12] * result[2] - m[13] * result[6] - m[14] * result[10];
        return result;
    };

    /**
     * Returns the transpose of a 4x4 matrix
     *
     * @method transpose
     * @static
     * @param {Transform} m matrix
     * @return {Transform} the resulting transposed matrix
     */
    Transform.transpose = function transpose(m) {
        return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];
    };

    function _normSquared(v) {
        return (v.length === 2) ? v[0] * v[0] + v[1] * v[1] : v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    }
    function _norm(v) {
        return Math.sqrt(_normSquared(v));
    }
    function _sign(n) {
        return (n < 0) ? -1 : 1;
    }

    /**
     * Decompose Transform into separate .translate, .rotate, .scale,
     *    and .skew components.
     *
     * @method interpret
     * @static
     * @param {Transform} M tranform matrix
     * @return {Object} matrix spec object with component matrices .translate,
     *    .rotate, .scale, .skew
     */
    Transform.interpret = function interpret(M) {

        // QR decomposition via Householder reflections
        //FIRST ITERATION

        //default Q1 to the identity matrix;
        var x = [M[0], M[1], M[2]];                // first column vector
        var sgn = _sign(x[0]);                     // sign of first component of x (for stability)
        var xNorm = _norm(x);                      // norm of first column vector
        var v = [x[0] + sgn * xNorm, x[1], x[2]];  // v = x + sign(x[0])|x|e1
        var mult = 2 / _normSquared(v);            // mult = 2/v'v

        //bail out if our Matrix is singular
        if (mult >= Infinity) {
            return {translate: Transform.getTranslate(M), rotate: [0, 0, 0], scale: [0, 0, 0], skew: [0, 0, 0]};
        }

        //evaluate Q1 = I - 2vv'/v'v
        var Q1 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

        //diagonals
        Q1[0]  = 1 - mult * v[0] * v[0];    // 0,0 entry
        Q1[5]  = 1 - mult * v[1] * v[1];    // 1,1 entry
        Q1[10] = 1 - mult * v[2] * v[2];    // 2,2 entry

        //upper diagonal
        Q1[1] = -mult * v[0] * v[1];        // 0,1 entry
        Q1[2] = -mult * v[0] * v[2];        // 0,2 entry
        Q1[6] = -mult * v[1] * v[2];        // 1,2 entry

        //lower diagonal
        Q1[4] = Q1[1];                      // 1,0 entry
        Q1[8] = Q1[2];                      // 2,0 entry
        Q1[9] = Q1[6];                      // 2,1 entry

        //reduce first column of M
        var MQ1 = Transform.multiply(Q1, M);

        //SECOND ITERATION on (1,1) minor
        var x2 = [MQ1[5], MQ1[6]];
        var sgn2 = _sign(x2[0]);                    // sign of first component of x (for stability)
        var x2Norm = _norm(x2);                     // norm of first column vector
        var v2 = [x2[0] + sgn2 * x2Norm, x2[1]];    // v = x + sign(x[0])|x|e1
        var mult2 = 2 / _normSquared(v2);           // mult = 2/v'v

        //evaluate Q2 = I - 2vv'/v'v
        var Q2 = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];

        //diagonal
        Q2[5]  = 1 - mult2 * v2[0] * v2[0]; // 1,1 entry
        Q2[10] = 1 - mult2 * v2[1] * v2[1]; // 2,2 entry

        //off diagonals
        Q2[6] = -mult2 * v2[0] * v2[1];     // 2,1 entry
        Q2[9] = Q2[6];                      // 1,2 entry

        //calc QR decomposition. Q = Q1*Q2, R = Q'*M
        var Q = Transform.multiply(Q2, Q1);      //note: really Q transpose
        var R = Transform.multiply(Q, M);

        //remove negative scaling
        var remover = Transform.scale(R[0] < 0 ? -1 : 1, R[5] < 0 ? -1 : 1, R[10] < 0 ? -1 : 1);
        R = Transform.multiply(R, remover);
        Q = Transform.multiply(remover, Q);

        //decompose into rotate/scale/skew matrices
        var result = {};
        result.translate = Transform.getTranslate(M);
        result.rotate = [Math.atan2(-Q[6], Q[10]), Math.asin(Q[2]), Math.atan2(-Q[1], Q[0])];
        if (!result.rotate[0]) {
            result.rotate[0] = 0;
            result.rotate[2] = Math.atan2(Q[4], Q[5]);
        }
        result.scale = [R[0], R[5], R[10]];
        result.skew = [Math.atan2(R[9], result.scale[2]), Math.atan2(R[8], result.scale[2]), Math.atan2(R[4], result.scale[0])];

        //double rotation workaround
        if (Math.abs(result.rotate[0]) + Math.abs(result.rotate[2]) > 1.5 * Math.PI) {
            result.rotate[1] = Math.PI - result.rotate[1];
            if (result.rotate[1] > Math.PI) result.rotate[1] -= 2 * Math.PI;
            if (result.rotate[1] < -Math.PI) result.rotate[1] += 2 * Math.PI;
            if (result.rotate[0] < 0) result.rotate[0] += Math.PI;
            else result.rotate[0] -= Math.PI;
            if (result.rotate[2] < 0) result.rotate[2] += Math.PI;
            else result.rotate[2] -= Math.PI;
        }

        return result;
    };

    /**
     * Weighted average between two matrices by averaging their
     *     translation, rotation, scale, skew components.
     *     f(M1,M2,t) = (1 - t) * M1 + t * M2
     *
     * @method average
     * @static
     * @param {Transform} M1 f(M1,M2,0) = M1
     * @param {Transform} M2 f(M1,M2,1) = M2
     * @param {Number} t
     * @return {Transform} resulting matrix
     */
    Transform.average = function average(M1, M2, t) {
        t = (t === undefined) ? 0.5 : t;
        var specM1 = Transform.interpret(M1);
        var specM2 = Transform.interpret(M2);

        var specAvg = {
            translate: [0, 0, 0],
            rotate: [0, 0, 0],
            scale: [0, 0, 0],
            skew: [0, 0, 0]
        };

        for (var i = 0; i < 3; i++) {
            specAvg.translate[i] = (1 - t) * specM1.translate[i] + t * specM2.translate[i];
            specAvg.rotate[i] = (1 - t) * specM1.rotate[i] + t * specM2.rotate[i];
            specAvg.scale[i] = (1 - t) * specM1.scale[i] + t * specM2.scale[i];
            specAvg.skew[i] = (1 - t) * specM1.skew[i] + t * specM2.skew[i];
        }
        return Transform.build(specAvg);
    };

    /**
     * Compose .translate, .rotate, .scale, .skew components into
     * Transform matrix
     *
     * @method build
     * @static
     * @param {matrixSpec} spec object with component matrices .translate,
     *    .rotate, .scale, .skew
     * @return {Transform} composed martix
     */
    Transform.build = function build(spec) {
        var scaleMatrix = Transform.scale(spec.scale[0], spec.scale[1], spec.scale[2]);
        var skewMatrix = Transform.skew(spec.skew[0], spec.skew[1], spec.skew[2]);
        var rotateMatrix = Transform.rotate(spec.rotate[0], spec.rotate[1], spec.rotate[2]);
        return Transform.thenMove(Transform.multiply(Transform.multiply(rotateMatrix, skewMatrix), scaleMatrix), spec.translate);
    };

    /**
     * Determine if two Transforms are component-wise equal
     *   Warning: breaks on perspective Transforms
     *
     * @method equals
     * @static
     * @param {Transform} a matrix
     * @param {Transform} b matrix
     * @return {boolean}
     */
    Transform.equals = function equals(a, b) {
        return !Transform.notEquals(a, b);
    };

    /**
     * Determine if two Transforms are component-wise unequal
     *   Warning: breaks on perspective Transforms
     *
     * @method notEquals
     * @static
     * @param {Transform} a matrix
     * @param {Transform} b matrix
     * @return {boolean}
     */
    Transform.notEquals = function notEquals(a, b) {
        if (a === b) return false;
        if (!(a && b)) return true;

        // shortci
        return !(a && b) ||
            a[12] !== b[12] || a[13] !== b[13] || a[14] !== b[14] ||
            a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] ||
            a[4] !== b[4] || a[5] !== b[5] || a[6] !== b[6] ||
            a[8] !== b[8] || a[9] !== b[9] || a[10] !== b[10];
    };

    /**
     * Constrain angle-trio components to range of [-pi, pi).
     *
     * @method normalizeRotation
     * @static
     * @param {Array.Number} rotation phi, theta, psi (array of floats
     *    && array.length == 3)
     * @return {Array.Number} new phi, theta, psi triplet
     *    (array of floats && array.length == 3)
     */
    Transform.normalizeRotation = function normalizeRotation(rotation) {
        var result = rotation.slice(0);
        if (result[0] === Math.PI * 0.5 || result[0] === -Math.PI * 0.5) {
            result[0] = -result[0];
            result[1] = Math.PI - result[1];
            result[2] -= Math.PI;
        }
        if (result[0] > Math.PI * 0.5) {
            result[0] = result[0] - Math.PI;
            result[1] = Math.PI - result[1];
            result[2] -= Math.PI;
        }
        if (result[0] < -Math.PI * 0.5) {
            result[0] = result[0] + Math.PI;
            result[1] = -Math.PI - result[1];
            result[2] -= Math.PI;
        }
        while (result[1] < -Math.PI) result[1] += 2 * Math.PI;
        while (result[1] >= Math.PI) result[1] -= 2 * Math.PI;
        while (result[2] < -Math.PI) result[2] += 2 * Math.PI;
        while (result[2] >= Math.PI) result[2] -= 2 * Math.PI;
        return result;
    };

    /**
     * (Property) Array defining a translation forward in z by 1
     *
     * @property {array} inFront
     * @static
     * @final
     */
    Transform.inFront = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1e-3, 1];

    /**
     * (Property) Array defining a translation backwards in z by 1
     *
     * @property {array} behind
     * @static
     * @final
     */
    Transform.behind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1e-3, 1];

    module.exports = Transform;
});


/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/SpecParser',['require','exports','module','./Transform'],function(require, exports, module) {
    var Transform = require('./Transform');

    /**
     *
     * This object translates the rendering instructions ("render specs")
     *   that renderable components generate into document update
     *   instructions ("update specs").  Private.
     *
     * @private
     * @class SpecParser
     * @constructor
     */
    function SpecParser() {
        this.result = {};
    }
    SpecParser._instance = new SpecParser();

    /**
     * Convert a render spec coming from the context's render chain to an
     *    update spec for the update chain. This is the only major entry point
     *    for a consumer of this class.
     *
     * @method parse
     * @static
     * @private
     *
     * @param {renderSpec} spec input render spec
     * @param {Object} context context to do the parse in
     * @return {Object} the resulting update spec (if no callback
     *   specified, else none)
     */
    SpecParser.parse = function parse(spec, context) {
        return SpecParser._instance.parse(spec, context);
    };

    /**
     * Convert a renderSpec coming from the context's render chain to an update
     *    spec for the update chain. This is the only major entrypoint for a
     *    consumer of this class.
     *
     * @method parse
     *
     * @private
     * @param {renderSpec} spec input render spec
     * @param {Context} context
     * @return {updateSpec} the resulting update spec
     */
    SpecParser.prototype.parse = function parse(spec, context) {
        this.reset();
        this._parseSpec(spec, context, Transform.identity);
        return this.result;
    };

    /**
     * Prepare SpecParser for re-use (or first use) by setting internal state
     *  to blank.
     *
     * @private
     * @method reset
     */
    SpecParser.prototype.reset = function reset() {
        this.result = {};
    };

    // Multiply matrix M by vector v
    function _vecInContext(v, m) {
        return [
            v[0] * m[0] + v[1] * m[4] + v[2] * m[8],
            v[0] * m[1] + v[1] * m[5] + v[2] * m[9],
            v[0] * m[2] + v[1] * m[6] + v[2] * m[10]
        ];
    }

    var _originZeroZero = [0, 0];

    // From the provided renderSpec tree, recursively compose opacities,
    //    origins, transforms, and sizes corresponding to each surface id from
    //    the provided renderSpec tree structure. On completion, those
    //    properties of 'this' object should be ready to use to build an
    //    updateSpec.
    SpecParser.prototype._parseSpec = function _parseSpec(spec, parentContext, sizeContext) {
        var id;
        var target;
        var transform;
        var opacity;
        var origin;
        var size;

        if (typeof spec === 'number') {
            id = spec;
            transform = parentContext.transform;
            if (parentContext.size && parentContext.origin && (parentContext.origin[0] || parentContext.origin[1])) {
                var originAdjust = [parentContext.origin[0] * parentContext.size[0], parentContext.origin[1] * parentContext.size[1], 0];
                transform = Transform.thenMove(transform, _vecInContext(originAdjust, sizeContext));
            }
            this.result[id] = {
                transform: transform,
                opacity: parentContext.opacity,
                origin: parentContext.origin || _originZeroZero,
                size: parentContext.size
            };
        }
        else if (!spec) { // placed here so 0 will be cached earlier
            return;
        }
        else if (spec instanceof Array) {
            for (var i = 0; i < spec.length; i++) {
                this._parseSpec(spec[i], parentContext, sizeContext);
            }
        }
        else {
            target = spec.target;
            transform = parentContext.transform;
            opacity = parentContext.opacity;
            origin = parentContext.origin;
            size = parentContext.size;
            var nextSizeContext = sizeContext;

            if (spec.opacity !== undefined) opacity = parentContext.opacity * spec.opacity;
            if (spec.transform) transform = Transform.multiply(parentContext.transform, spec.transform);
            if (spec.origin) {
                origin = spec.origin;
                nextSizeContext = parentContext.transform;
            }
            if (spec.size) {
                var parentSize = parentContext.size;
                size = [spec.size[0] || parentSize[0], spec.size[1] || parentSize[1]];
                if (parentSize && origin && (origin[0] || origin[1])) {
                    transform = Transform.thenMove(transform, _vecInContext([origin[0] * parentSize[0], origin[1] * parentSize[1], 0], sizeContext));
                    transform = Transform.moveThen([-origin[0] * size[0], -origin[1] * size[1], 0], transform);
                }
                nextSizeContext = parentContext.transform;
                origin = null;
            }

            this._parseSpec(target, {
                transform: transform,
                opacity: opacity,
                origin: origin,
                size: size
            }, nextSizeContext);
        }
    };

    module.exports = SpecParser;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/RenderNode',['require','exports','module','./Entity','./SpecParser'],function(require, exports, module) {
    var Entity = require('./Entity');
    var SpecParser = require('./SpecParser');

    /**
     * A wrapper for inserting a renderable component (like a Modifer or
     *   Surface) into the render tree.
     *
     * @class RenderNode
     * @constructor
     *
     * @param {Object} object Target renderable component
     */
    function RenderNode(object) {
        this._object = null;
        this._child = null;
        this._hasMultipleChildren = false;
        this._isRenderable = false;
        this._isModifier = false;

        this._resultCache = {};
        this._prevResults = {};

        this._childResult = null;

        if (object) this.set(object);
    }

    /**
     * Append a renderable to the list of this node's children.
     *   This produces a new RenderNode in the tree.
     *   Note: Does not double-wrap if child is a RenderNode already.
     *
     * @method add
     * @param {Object} child renderable object
     * @return {RenderNode} new render node wrapping child
     */
    RenderNode.prototype.add = function add(child) {
        var childNode = (child instanceof RenderNode) ? child : new RenderNode(child);
        if (this._child instanceof Array) this._child.push(childNode);
        else if (this._child) {
            this._child = [this._child, childNode];
            this._hasMultipleChildren = true;
            this._childResult = []; // to be used later
        }
        else this._child = childNode;

        return childNode;
    };

    /**
     * Return the single wrapped object.  Returns null if this node has multiple child nodes.
     *
     * @method get
     *
     * @return {Ojbect} contained renderable object
     */
    RenderNode.prototype.get = function get() {
        return this._object || (this._hasMultipleChildren ? null : (this._child ? this._child.get() : null));
    };

    /**
     * Overwrite the list of children to contain the single provided object
     *
     * @method set
     * @param {Object} child renderable object
     * @return {RenderNode} this render node, or child if it is a RenderNode
     */
    RenderNode.prototype.set = function set(child) {
        this._childResult = null;
        this._hasMultipleChildren = false;
        this._isRenderable = child.render ? true : false;
        this._isModifier = child.modify ? true : false;
        this._object = child;
        this._child = null;
        if (child instanceof RenderNode) return child;
        else return this;
    };

    /**
     * Get render size of contained object.
     *
     * @method getSize
     * @return {Array.Number} size of this or size of single child.
     */
    RenderNode.prototype.getSize = function getSize() {
        var result = null;
        var target = this.get();
        if (target && target.getSize) result = target.getSize();
        if (!result && this._child && this._child.getSize) result = this._child.getSize();
        return result;
    };

    // apply results of rendering this subtree to the document
    function _applyCommit(spec, context, cacheStorage) {
        var result = SpecParser.parse(spec, context);
        var keys = Object.keys(result);
        for (var i = 0; i < keys.length; i++) {
            var id = keys[i];
            var childNode = Entity.get(id);
            var commitParams = result[id];
            commitParams.allocator = context.allocator;
            var commitResult = childNode.commit(commitParams);
            if (commitResult) _applyCommit(commitResult, context, cacheStorage);
            else cacheStorage[id] = commitParams;
        }
    }

    /**
     * Commit the content change from this node to the document.
     *
     * @private
     * @method commit
     * @param {Context} context render context
     */
    RenderNode.prototype.commit = function commit(context) {
        // free up some divs from the last loop
        var prevKeys = Object.keys(this._prevResults);
        for (var i = 0; i < prevKeys.length; i++) {
            var id = prevKeys[i];
            if (this._resultCache[id] === undefined) {
                var object = Entity.get(id);
                if (object.cleanup) object.cleanup(context.allocator);
            }
        }

        this._prevResults = this._resultCache;
        this._resultCache = {};
        _applyCommit(this.render(), context, this._resultCache);
    };

    /**
     * Generate a render spec from the contents of the wrapped component.
     *
     * @private
     * @method render
     *
     * @return {Object} render specification for the component subtree
     *    only under this node.
     */
    RenderNode.prototype.render = function render() {
        if (this._isRenderable) return this._object.render();

        var result = null;
        if (this._hasMultipleChildren) {
            result = this._childResult;
            var children = this._child;
            for (var i = 0; i < children.length; i++) {
                result[i] = children[i].render();
            }
        }
        else if (this._child) result = this._child.render();

        return this._isModifier ? this._object.modify(result) : result;
    };

    module.exports = RenderNode;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/EventEmitter',['require','exports','module'],function(require, exports, module) {
    /**
     * EventEmitter represents a channel for events.
     *
     * @class EventEmitter
     * @constructor
     */
    function EventEmitter() {
        this.listeners = {};
        this._owner = this;
    }

    /**
     * Trigger an event, sending to all downstream handlers
     *   listening for provided 'type' key.
     *
     * @method emit
     *
     * @param {string} type event type key (for example, 'click')
     * @param {Object} event event data
     * @return {EventHandler} this
     */
    EventEmitter.prototype.emit = function emit(type, event) {
        var handlers = this.listeners[type];
        if (handlers) {
            for (var i = 0; i < handlers.length; i++) {
                handlers[i].call(this._owner, event);
            }
        }
        return this;
    };

    /**
     * Bind a callback function to an event type handled by this object.
     *
     * @method "on"
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function(string, Object)} handler callback
     * @return {EventHandler} this
     */
   EventEmitter.prototype.on = function on(type, handler) {
        if (!(type in this.listeners)) this.listeners[type] = [];
        var index = this.listeners[type].indexOf(handler);
        if (index < 0) this.listeners[type].push(handler);
        return this;
    };

    /**
     * Alias for "on".
     * @method addListener
     */
    EventEmitter.prototype.addListener = EventEmitter.prototype.on;

   /**
     * Unbind an event by type and handler.
     *   This undoes the work of "on".
     *
     * @method removeListener
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function} handler function object to remove
     * @return {EventEmitter} this
     */
    EventEmitter.prototype.removeListener = function removeListener(type, handler) {
        var index = this.listeners[type].indexOf(handler);
        if (index >= 0) this.listeners[type].splice(index, 1);
        return this;
    };

    /**
     * Call event handlers with this set to owner.
     *
     * @method bindThis
     *
     * @param {Object} owner object this EventEmitter belongs to
     */
    EventEmitter.prototype.bindThis = function bindThis(owner) {
        this._owner = owner;
    };

    module.exports = EventEmitter;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/EventHandler',['require','exports','module','./EventEmitter'],function(require, exports, module) {
    var EventEmitter = require('./EventEmitter');

    /**
     * EventHandler forwards received events to a set of provided callback functions.
     * It allows events to be captured, processed, and optionally piped through to other event handlers.
     *
     * @class EventHandler
     * @extends EventEmitter
     * @constructor
     */
    function EventHandler() {
        EventEmitter.apply(this, arguments);

        this.downstream = []; // downstream event handlers
        this.downstreamFn = []; // downstream functions

        this.upstream = []; // upstream event handlers
        this.upstreamListeners = {}; // upstream listeners
    }
    EventHandler.prototype = Object.create(EventEmitter.prototype);
    EventHandler.prototype.constructor = EventHandler;

    /**
     * Assign an event handler to receive an object's input events.
     *
     * @method setInputHandler
     * @static
     *
     * @param {Object} object object to mix trigger, subscribe, and unsubscribe functions into
     * @param {EventHandler} handler assigned event handler
     */
    EventHandler.setInputHandler = function setInputHandler(object, handler) {
        object.trigger = handler.trigger.bind(handler);
        if (handler.subscribe && handler.unsubscribe) {
            object.subscribe = handler.subscribe.bind(handler);
            object.unsubscribe = handler.unsubscribe.bind(handler);
        }
    };

    /**
     * Assign an event handler to receive an object's output events.
     *
     * @method setOutputHandler
     * @static
     *
     * @param {Object} object object to mix pipe, unpipe, on, addListener, and removeListener functions into
     * @param {EventHandler} handler assigned event handler
     */
    EventHandler.setOutputHandler = function setOutputHandler(object, handler) {
        if (handler instanceof EventHandler) handler.bindThis(object);
        object.pipe = handler.pipe.bind(handler);
        object.unpipe = handler.unpipe.bind(handler);
        object.on = handler.on.bind(handler);
        object.addListener = handler.on;
        object.removeListener = handler.removeListener.bind(handler);
    };

    /**
     * Trigger an event, sending to all downstream handlers
     *   listening for provided 'type' key.
     *
     * @method emit
     *
     * @param {string} type event type key (for example, 'click')
     * @param {Object} event event data
     * @return {EventHandler} this
     */
    EventHandler.prototype.emit = function emit(type, event) {
        EventEmitter.prototype.emit.apply(this, arguments);
        var i = 0;
        for (i = 0; i < this.downstream.length; i++) {
            this.downstream[i].trigger(type, event);
        }
        for (i = 0; i < this.downstreamFn.length; i++) {
            this.downstreamFn[i](type, event);
        }
        return this;
    };

    /**
     * Alias for emit
     * @method addListener
     */
    EventHandler.prototype.trigger = EventHandler.prototype.emit;

    /**
     * Add event handler object to set of downstream handlers.
     *
     * @method pipe
     *
     * @param {EventHandler} target event handler target object
     * @return {EventHandler} passed event handler
     */
    EventHandler.prototype.pipe = function pipe(target) {
        if (target.subscribe instanceof Function) return target.subscribe(this);

        var downstreamCtx = (target instanceof Function) ? this.downstreamFn : this.downstream;
        var index = downstreamCtx.indexOf(target);
        if (index < 0) downstreamCtx.push(target);

        if (target instanceof Function) target('pipe', null);
        else if (target.trigger) target.trigger('pipe', null);

        return target;
    };

    /**
     * Remove handler object from set of downstream handlers.
     *   Undoes work of "pipe".
     *
     * @method unpipe
     *
     * @param {EventHandler} target target handler object
     * @return {EventHandler} provided target
     */
    EventHandler.prototype.unpipe = function unpipe(target) {
        if (target.unsubscribe instanceof Function) return target.unsubscribe(this);

        var downstreamCtx = (target instanceof Function) ? this.downstreamFn : this.downstream;
        var index = downstreamCtx.indexOf(target);
        if (index >= 0) {
            downstreamCtx.splice(index, 1);
            if (target instanceof Function) target('unpipe', null);
            else if (target.trigger) target.trigger('unpipe', null);
            return target;
        }
        else return false;
    };

    /**
     * Bind a callback function to an event type handled by this object.
     *
     * @method "on"
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function(string, Object)} handler callback
     * @return {EventHandler} this
     */
    EventHandler.prototype.on = function on(type, handler) {
        EventEmitter.prototype.on.apply(this, arguments);
        if (!(type in this.upstreamListeners)) {
            var upstreamListener = this.trigger.bind(this, type);
            this.upstreamListeners[type] = upstreamListener;
            for (var i = 0; i < this.upstream.length; i++) {
                this.upstream[i].on(type, upstreamListener);
            }
        }
        return this;
    };

    /**
     * Alias for "on"
     * @method addListener
     */
    EventHandler.prototype.addListener = EventHandler.prototype.on;

    /**
     * Listen for events from an upstream event handler.
     *
     * @method subscribe
     *
     * @param {EventEmitter} source source emitter object
     * @return {EventHandler} this
     */
    EventHandler.prototype.subscribe = function subscribe(source) {
        var index = this.upstream.indexOf(source);
        if (index < 0) {
            this.upstream.push(source);
            for (var type in this.upstreamListeners) {
                source.on(type, this.upstreamListeners[type]);
            }
        }
        return this;
    };

    /**
     * Stop listening to events from an upstream event handler.
     *
     * @method unsubscribe
     *
     * @param {EventEmitter} source source emitter object
     * @return {EventHandler} this
     */
    EventHandler.prototype.unsubscribe = function unsubscribe(source) {
        var index = this.upstream.indexOf(source);
        if (index >= 0) {
            this.upstream.splice(index, 1);
            for (var type in this.upstreamListeners) {
                source.removeListener(type, this.upstreamListeners[type]);
            }
        }
        return this;
    };

    module.exports = EventHandler;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/ElementAllocator',['require','exports','module'],function(require, exports, module) {

    /**
     * Internal helper object to Context that handles the process of
     *   creating and allocating DOM elements within a managed div.
     *   Private.
     *
     * @class ElementAllocator
     * @constructor
     * @private
     * @param {Node} container document element in which Famo.us content will be inserted
     */
    function ElementAllocator(container) {
        if (!container) container = document.createDocumentFragment();
        this.container = container;
        this.detachedNodes = {};
        this.nodeCount = 0;
    }

    /**
     * Move the document elements from their original container to a new one.
     *
     * @private
     * @method migrate
     *
     * @param {Node} container document element to which Famo.us content will be migrated
     */
    ElementAllocator.prototype.migrate = function migrate(container) {
        var oldContainer = this.container;
        if (container === oldContainer) return;

        if (oldContainer instanceof DocumentFragment) {
            container.appendChild(oldContainer);
        }
        else {
            while (oldContainer.hasChildNodes()) {
                container.appendChild(oldContainer.removeChild(oldContainer.firstChild));
            }
        }

        this.container = container;
    };

    /**
     * Allocate an element of specified type from the pool.
     *
     * @private
     * @method allocate
     *
     * @param {string} type type of element, e.g. 'div'
     * @return {Node} allocated document element
     */
    ElementAllocator.prototype.allocate = function allocate(type) {
        type = type.toLowerCase();
        if (!(type in this.detachedNodes)) this.detachedNodes[type] = [];
        var nodeStore = this.detachedNodes[type];
        var result;
        if (nodeStore.length > 0) {
            result = nodeStore.pop();
        }
        else {
            result = document.createElement(type);
            this.container.appendChild(result);
        }
        this.nodeCount++;
        return result;
    };

    /**
     * De-allocate an element of specified type to the pool.
     *
     * @private
     * @method deallocate
     *
     * @param {Node} element document element to deallocate
     */
    ElementAllocator.prototype.deallocate = function deallocate(element) {
        var nodeType = element.nodeName.toLowerCase();
        var nodeStore = this.detachedNodes[nodeType];
        nodeStore.push(element);
        this.nodeCount--;
    };

    /**
     * Get count of total allocated nodes in the document.
     *
     * @private
     * @method getNodeCount
     *
     * @return {Number} total node count
     */
    ElementAllocator.prototype.getNodeCount = function getNodeCount() {
        return this.nodeCount;
    };

    module.exports = ElementAllocator;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/utilities/Utility',['require','exports','module'],function(require, exports, module) {
    /**
     * This namespace holds standalone functionality.
     *  Currently includes name mapping for transition curves,
     *  name mapping for origin pairs, and the after() function.
     *
     * @class Utility
     * @static
     */
    var Utility = {};

    /**
     * Table of direction array positions
     *
     * @property {object} Direction
     * @final
     */
    Utility.Direction = {
        X: 0,
        Y: 1,
        Z: 2
    };

    /**
     * Return wrapper around callback function. Once the wrapper is called N
     *   times, invoke the callback function. Arguments and scope preserved.
     *
     * @method after
     *
     * @param {number} count number of calls before callback function invoked
     * @param {Function} callback wrapped callback function
     *
     * @return {function} wrapped callback with coundown feature
     */
    Utility.after = function after(count, callback) {
        var counter = count;
        return function() {
            counter--;
            if (counter === 0) callback.apply(this, arguments);
        };
    };

    /**
     * Load a URL and return its contents in a callback
     *
     * @method loadURL
     *
     * @param {string} url URL of object
     * @param {function} callback callback to dispatch with content
     */
    Utility.loadURL = function loadURL(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function onreadystatechange() {
            if (this.readyState === 4) {
                if (callback) callback(this.responseText);
            }
        };
        xhr.open('GET', url);
        xhr.send();
    };

    /**
     * Create a document fragment from a string of HTML
     *
     * @method createDocumentFragmentFromHTML
     *
     * @param {string} html HTML to convert to DocumentFragment
     *
     * @return {DocumentFragment} DocumentFragment representing input HTML
     */
    Utility.createDocumentFragmentFromHTML = function createDocumentFragmentFromHTML(html) {
        var element = document.createElement('div');
        element.innerHTML = html;
        var result = document.createDocumentFragment();
        while (element.hasChildNodes()) result.appendChild(element.firstChild);
        return result;
    };

    module.exports = Utility;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/transitions/MultipleTransition',['require','exports','module','famous/utilities/Utility'],function(require, exports, module) {
    var Utility = require('famous/utilities/Utility');

    /**
     * Transition meta-method to support transitioning multiple
     *   values with scalar-only methods.
     *
     *
     * @class MultipleTransition
     * @constructor
     *
     * @param {Object} method Transionable class to multiplex
     */
    function MultipleTransition(method) {
        this.method = method;
        this._instances = [];
        this.state = [];
    }

    MultipleTransition.SUPPORTS_MULTIPLE = true;

    /**
     * Get the state of each transition.
     *
     * @method get
     *
     * @return state {Number|Array} state array
     */
    MultipleTransition.prototype.get = function get() {
        for (var i = 0; i < this._instances.length; i++) {
            this.state[i] = this._instances[i].get();
        }
        return this.state;
    };

    /**
     * Set the end states with a shared transition, with optional callback.
     *
     * @method set
     *
     * @param {Number|Array} endState Final State.  Use a multi-element argument for multiple transitions.
     * @param {Object} transition Transition definition, shared among all instances
     * @param {Function} callback called when all endStates have been reached.
     */
    MultipleTransition.prototype.set = function set(endState, transition, callback) {
        var _allCallback = Utility.after(endState.length, callback);
        for (var i = 0; i < endState.length; i++) {
            if (!this._instances[i]) this._instances[i] = new (this.method)();
            this._instances[i].set(endState[i], transition, _allCallback);
        }
    };

    /**
     * Reset all transitions to start state.
     *
     * @method reset
     *
     * @param  {Number|Array} startState Start state
     */
    MultipleTransition.prototype.reset = function reset(startState) {
        for (var i = 0; i < startState.length; i++) {
            if (!this._instances[i]) this._instances[i] = new (this.method)();
            this._instances[i].reset(startState[i]);
        }
    };

    module.exports = MultipleTransition;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/transitions/TweenTransition',['require','exports','module'],function(require, exports, module) {

    /**
     *
     * A state maintainer for a smooth transition between
     *    numerically-specified states.  Example numeric states include floats or
     *    Transfornm objects.
     *
     *    An initial state is set with the constructor or set(startValue). A
     *    corresponding end state and transition are set with set(endValue,
     *    transition). Subsequent calls to set(endValue, transition) begin at
     *    the last state. Calls to get(timestamp) provide the _interpolated state
     *    along the way.
     *
     *   Note that there is no event loop here - calls to get() are the only way
     *    to find out state projected to the current (or provided) time and are
     *    the only way to trigger callbacks. Usually this kind of object would
     *    be part of the render() path of a visible component.
     *
     * @class TweenTransition
     * @constructor
     *
     * @param {Object} options TODO
     *    beginning state
     */
    function TweenTransition(options) {
        this.options = Object.create(TweenTransition.DEFAULT_OPTIONS);
        if (options) this.setOptions(options);

        this._startTime = 0;
        this._startValue = 0;
        this._updateTime = 0;
        this._endValue = 0;
        this._curve = undefined;
        this._duration = 0;
        this._active = false;
        this._callback = undefined;
        this.state = 0;
        this.velocity = undefined;
    }

    /**
     * Transition curves mapping independent variable t from domain [0,1] to a
     *    range within [0,1]. Includes functions 'linear', 'easeIn', 'easeOut',
     *    'easeInOut', 'easeOutBounce', 'spring'.
     *
     * @property {object} Curve
     * @final
     */
    TweenTransition.Curves = {
        linear: function(t) {
            return t;
        },
        easeIn: function(t) {
            return t*t;
        },
        easeOut: function(t) {
            return t*(2-t);
        },
        easeInOut: function(t) {
            if (t <= 0.5) return 2*t*t;
            else return -2*t*t + 4*t - 1;
        },
        easeOutBounce: function(t) {
            return t*(3 - 2*t);
        },
        spring: function(t) {
            return (1 - t) * Math.sin(6 * Math.PI * t) + t;
        }
    };

    TweenTransition.SUPPORTS_MULTIPLE = true;
    TweenTransition.DEFAULT_OPTIONS = {
        curve: TweenTransition.Curves.linear,
        duration: 500,
        speed: 0 /* considered only if positive */
    };

    var registeredCurves = {};

    /**
     * Add "unit" curve to internal dictionary of registered curves.
     *
     * @method registerCurve
     *
     * @static
     *
     * @param {string} curveName dictionary key
     * @param {unitCurve} curve function of one numeric variable mapping [0,1]
     *    to range inside [0,1]
     * @return {boolean} false if key is taken, else true
     */
    TweenTransition.registerCurve = function registerCurve(curveName, curve) {
        if (!registeredCurves[curveName]) {
            registeredCurves[curveName] = curve;
            return true;
        }
        else {
            return false;
        }
    };

    /**
     * Remove object with key "curveName" from internal dictionary of registered
     *    curves.
     *
     * @method unregisterCurve
     *
     * @static
     *
     * @param {string} curveName dictionary key
     * @return {boolean} false if key has no dictionary value
     */
    TweenTransition.unregisterCurve = function unregisterCurve(curveName) {
        if (registeredCurves[curveName]) {
            delete registeredCurves[curveName];
            return true;
        }
        else {
            return false;
        }
    };

    /**
     * Retrieve function with key "curveName" from internal dictionary of
     *    registered curves. Default curves are defined in the
     *    TweenTransition.Curves array, where the values represent
     *    unitCurve functions.
     *
     * @method getCurve
     *
     * @static
     *
     * @param {string} curveName dictionary key
     * @return {unitCurve} curve function of one numeric variable mapping [0,1]
     *    to range inside [0,1]
     */
    TweenTransition.getCurve = function getCurve(curveName) {
        return registeredCurves[curveName];
    };

    /**
     * Retrieve all available curves.
     *
     * @method getCurves
     *
     * @static
     *
     * @return {object} curve functions of one numeric variable mapping [0,1]
     *    to range inside [0,1]
     */
    TweenTransition.getCurves = function getCurves() {
        return registeredCurves;
    };

     // Interpolate: If a linear function f(0) = a, f(1) = b, then return f(t)
    function _interpolate(a, b, t) {
        return ((1 - t) * a) + (t * b);
    }

    function _clone(obj) {
        if (obj instanceof Object) {
            if (obj instanceof Array) return obj.slice(0);
            else return Object.create(obj);
        }
        else return obj;
    }

    // Fill in missing properties in "transition" with those in defaultTransition, and
    //   convert internal named curve to function object, returning as new
    //   object.
    function _normalize(transition, defaultTransition) {
        var result = {curve: defaultTransition.curve};
        if (defaultTransition.duration) result.duration = defaultTransition.duration;
        if (defaultTransition.speed) result.speed = defaultTransition.speed;
        if (transition instanceof Object) {
            if (transition.duration !== undefined) result.duration = transition.duration;
            if (transition.curve) result.curve = transition.curve;
            if (transition.speed) result.speed = transition.speed;
        }
        if (typeof result.curve === 'string') result.curve = TweenTransition.getCurve(result.curve);
        return result;
    }

    /**
     * Set internal options, overriding any default options.
     *
     * @method setOptions
     *
     *
     * @param {Object} options options object
     * @param {Object} [options.curve] function mapping [0,1] to [0,1] or identifier
     * @param {Number} [options.duration] duration in ms
     * @param {Number} [options.speed] speed in pixels per ms
     */
    TweenTransition.prototype.setOptions = function setOptions(options) {
        if (options.curve !== undefined) this.options.curve = options.curve;
        if (options.duration !== undefined) this.options.duration = options.duration;
        if (options.speed !== undefined) this.options.speed = options.speed;
    };

    /**
     * Add transition to end state to the queue of pending transitions. Special
     *    Use: calling without a transition resets the object to that state with
     *    no pending actions
     *
     * @method set
     *
     *
     * @param {number|FamousMatrix|Array.Number|Object.<number, number>} endValue
     *    end state to which we _interpolate
     * @param {transition=} transition object of type {duration: number, curve:
     *    f[0,1] -> [0,1] or name}. If transition is omitted, change will be
     *    instantaneous.
     * @param {function()=} callback Zero-argument function to call on observed
     *    completion (t=1)
     */
    TweenTransition.prototype.set = function set(endValue, transition, callback) {
        if (!transition) {
            this.reset(endValue);
            if (callback) callback();
            return;
        }

        this._startValue = _clone(this.get());
        transition = _normalize(transition, this.options);
        if (transition.speed) {
            var startValue = this._startValue;
            if (startValue instanceof Object) {
                var variance = 0;
                for (var i in startValue) variance += (endValue[i] - startValue[i]) * (endValue[i] - startValue[i]);
                transition.duration = Math.sqrt(variance) / transition.speed;
            }
            else {
                transition.duration = Math.abs(endValue - startValue) / transition.speed;
            }
        }

        this._startTime = Date.now();
        this._endValue = _clone(endValue);
        this._startVelocity = _clone(transition.velocity);
        this._duration = transition.duration;
        this._curve = transition.curve;
        this._active = true;
        this._callback = callback;
    };

    /**
     * Cancel all transitions and reset to a stable state
     *
     * @method reset
     *
     * @param {number|Array.Number|Object.<number, number>} startValue
     *    starting state
     * @param {number} startVelocity
     *    starting velocity
     */
    TweenTransition.prototype.reset = function reset(startValue, startVelocity) {
        if (this._callback) {
            var callback = this._callback;
            this._callback = undefined;
            callback();
        }
        this.state = _clone(startValue);
        this.velocity = _clone(startVelocity);
        this._startTime = 0;
        this._duration = 0;
        this._updateTime = 0;
        this._startValue = this.state;
        this._startVelocity = this.velocity;
        this._endValue = this.state;
        this._active = false;
    };

    /**
     * Get current velocity
     *
     * @method getVelocity
     *
     * @returns {Number} velocity
     */
    TweenTransition.prototype.getVelocity = function getVelocity() {
        return this.velocity;
    };

    /**
     * Get interpolated state of current action at provided time. If the last
     *    action has completed, invoke its callback.
     *
     * @method get
     *
     *
     * @param {number=} timestamp Evaluate the curve at a normalized version of this
     *    time. If omitted, use current time. (Unix epoch time)
     * @return {number|Object.<number|string, number>} beginning state
     *    _interpolated to this point in time.
     */
    TweenTransition.prototype.get = function get(timestamp) {
        this.update(timestamp);
        return this.state;
    };

    function _calculateVelocity(current, start, curve, duration, t) {
        var velocity;
        var eps = 1e-7;
        var speed = (curve(t) - curve(t - eps)) / eps;
        if (current instanceof Array) {
            velocity = [];
            for (var i = 0; i < current.length; i++)
                velocity[i] = speed * (current[i] - start[i]) / duration;
        }
        else velocity = speed * (current - start) / duration;
        return velocity;
    }

    function _calculateState(start, end, t) {
        var state;
        if (start instanceof Array) {
            state = [];
            for (var i = 0; i < start.length; i++)
                state[i] = _interpolate(start[i], end[i], t);
        }
        else state = _interpolate(start, end, t);
        return state;
    }

    /**
     * Update internal state to the provided timestamp. This may invoke the last
     *    callback and begin a new action.
     *
     * @method update
     *
     *
     * @param {number=} timestamp Evaluate the curve at a normalized version of this
     *    time. If omitted, use current time. (Unix epoch time)
     */
    TweenTransition.prototype.update = function update(timestamp) {
        if (!this._active) {
            if (this._callback) {
                var callback = this._callback;
                this._callback = undefined;
                callback();
            }
            return;
        }

        if (!timestamp) timestamp = Date.now();
        if (this._updateTime >= timestamp) return;
        this._updateTime = timestamp;

        var timeSinceStart = timestamp - this._startTime;
        if (timeSinceStart >= this._duration) {
            this.state = this._endValue;
            this.velocity = _calculateVelocity(this.state, this._startValue, this._curve, this._duration, 1);
            this._active = false;
        }
        else if (timeSinceStart < 0) {
            this.state = this._startValue;
            this.velocity = this._startVelocity;
        }
        else {
            var t = timeSinceStart / this._duration;
            this.state = _calculateState(this._startValue, this._endValue, this._curve(t));
            this.velocity = _calculateVelocity(this.state, this._startValue, this._curve, this._duration, t);
        }
    };

    /**
     * Is there at least one action pending completion?
     *
     * @method isActive
     *
     *
     * @return {boolean}
     */
    TweenTransition.prototype.isActive = function isActive() {
        return this._active;
    };

    /**
     * Halt transition at current state and erase all pending actions.
     *
     * @method halt
     *
     */
    TweenTransition.prototype.halt = function halt() {
        this.reset(this.get());
    };

    // Register all the default curves
    TweenTransition.registerCurve('linear', TweenTransition.Curves.linear);
    TweenTransition.registerCurve('easeIn', TweenTransition.Curves.easeIn);
    TweenTransition.registerCurve('easeOut', TweenTransition.Curves.easeOut);
    TweenTransition.registerCurve('easeInOut', TweenTransition.Curves.easeInOut);
    TweenTransition.registerCurve('easeOutBounce', TweenTransition.Curves.easeOutBounce);
    TweenTransition.registerCurve('spring', TweenTransition.Curves.spring);

    TweenTransition.customCurve = function customCurve(v1, v2) {
        v1 = v1 || 0; v2 = v2 || 0;
        return function(t) {
            return v1*t + (-2*v1 - v2 + 3)*t*t + (v1 + v2 - 2)*t*t*t;
        };
    };

    module.exports = TweenTransition;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/transitions/Transitionable',['require','exports','module','./MultipleTransition','./TweenTransition'],function(require, exports, module) {
    var MultipleTransition = require('./MultipleTransition');
    var TweenTransition = require('./TweenTransition');

    /**
     * A state maintainer for a smooth transition between
     *    numerically-specified states. Example numeric states include floats or
     *    Transform objects.
     *
     * An initial state is set with the constructor or set(startState). A
     *    corresponding end state and transition are set with set(endState,
     *    transition). Subsequent calls to set(endState, transition) begin at
     *    the last state. Calls to get(timestamp) provide the interpolated state
     *    along the way.
     *
     * Note that there is no event loop here - calls to get() are the only way
     *    to find state projected to the current (or provided) time and are
     *    the only way to trigger callbacks. Usually this kind of object would
     *    be part of the render() path of a visible component.
     *
     * @class Transitionable
     * @constructor
     * @param {number|Array.Number|Object.<number|string, number>} start
     *    beginning state
     */
    function Transitionable(start) {
        this.currentAction = null;
        this.actionQueue = [];
        this.callbackQueue = [];

        this.state = 0;
        this.velocity = undefined;
        this._callback = undefined;
        this._engineInstance = null;
        this._currentMethod = null;

        this.set(start);
    }

    var transitionMethods = {};

    Transitionable.registerMethod = function registerMethod(name, engineClass) {
        if (!(name in transitionMethods)) {
            transitionMethods[name] = engineClass;
            return true;
        }
        else return false;
    };

    Transitionable.unregisterMethod = function unregisterMethod(name) {
        if (name in transitionMethods) {
            delete transitionMethods[name];
            return true;
        }
        else return false;
    };

    function _loadNext() {
        if (this._callback) {
            var callback = this._callback;
            this._callback = undefined;
            callback();
        }
        if (this.actionQueue.length <= 0) {
            this.set(this.get()); // no update required
            return;
        }
        this.currentAction = this.actionQueue.shift();
        this._callback = this.callbackQueue.shift();

        var method = null;
        var endValue = this.currentAction[0];
        var transition = this.currentAction[1];
        if (transition instanceof Object && transition.method) {
            method = transition.method;
            if (typeof method === 'string') method = transitionMethods[method];
        }
        else {
            method = TweenTransition;
        }

        if (this._currentMethod !== method) {
            if (!(endValue instanceof Object) || method.SUPPORTS_MULTIPLE === true || endValue.length <= method.SUPPORTS_MULTIPLE) {
                this._engineInstance = new method();
            }
            else {
                this._engineInstance = new MultipleTransition(method);
            }
            this._currentMethod = method;
        }

        this._engineInstance.reset(this.state, this.velocity);
        if (this.velocity !== undefined) transition.velocity = this.velocity;
        this._engineInstance.set(endValue, transition, _loadNext.bind(this));
    }

    /**
     * Add transition to end state to the queue of pending transitions. Special
     *    Use: calling without a transition resets the object to that state with
     *    no pending actions
     *
     * @method set
     *
     * @param {number|FamousMatrix|Array.Number|Object.<number, number>} endState
     *    end state to which we interpolate
     * @param {transition=} transition object of type {duration: number, curve:
     *    f[0,1] -> [0,1] or name}. If transition is omitted, change will be
     *    instantaneous.
     * @param {function()=} callback Zero-argument function to call on observed
     *    completion (t=1)
     */
    Transitionable.prototype.set = function set(endState, transition, callback) {
        if (!transition) {
            this.reset(endState);
            if (callback) callback();
            return this;
        }

        var action = [endState, transition];
        this.actionQueue.push(action);
        this.callbackQueue.push(callback);
        if (!this.currentAction) _loadNext.call(this);
        return this;
    };

    /**
     * Cancel all transitions and reset to a stable state
     *
     * @method reset
     *
     * @param {number|Array.Number|Object.<number, number>} startState
     *    stable state to set to
     */
    Transitionable.prototype.reset = function reset(startState, startVelocity) {
        this._currentMethod = null;
        this._engineInstance = null;
        this.state = startState;
        this.velocity = startVelocity;
        this.currentAction = null;
        this.actionQueue = [];
        this.callbackQueue = [];
    };

    /**
     * Add delay action to the pending action queue queue.
     *
     * @method delay
     *
     * @param {number} duration delay time (ms)
     * @param {function} callback Zero-argument function to call on observed
     *    completion (t=1)
     */
    Transitionable.prototype.delay = function delay(duration, callback) {
        this.set(this._engineInstance.get(), {duration: duration,
            curve: function() {
                return 0;
            }},
            callback);
    };

    /**
     * Get interpolated state of current action at provided time. If the last
     *    action has completed, invoke its callback.
     *
     * @method get
     *
     * @param {number=} timestamp Evaluate the curve at a normalized version of this
     *    time. If omitted, use current time. (Unix epoch time)
     * @return {number|Object.<number|string, number>} beginning state
     *    interpolated to this point in time.
     */
    Transitionable.prototype.get = function get(timestamp) {
        if (this._engineInstance) {
            if (this._engineInstance.getVelocity)
                this.velocity = this._engineInstance.getVelocity();
            this.state = this._engineInstance.get(timestamp);
        }
        return this.state;
    };

    /**
     * Is there at least one action pending completion?
     *
     * @method isActive
     *
     * @return {boolean}
     */
    Transitionable.prototype.isActive = function isActive() {
        return !!this.currentAction;
    };

    /**
     * Halt transition at current state and erase all pending actions.
     *
     * @method halt
     */
    Transitionable.prototype.halt = function halt() {
        this.set(this.get());
    };

    module.exports = Transitionable;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Context',['require','exports','module','./RenderNode','./EventHandler','./ElementAllocator','./Transform','famous/transitions/Transitionable'],function(require, exports, module) {
    var RenderNode = require('./RenderNode');
    var EventHandler = require('./EventHandler');
    var ElementAllocator = require('./ElementAllocator');
    var Transform = require('./Transform');
    var Transitionable = require('famous/transitions/Transitionable');

    var _originZeroZero = [0, 0];

    function _getElementSize(element) {
        return [element.clientWidth, element.clientHeight];
    }

    /**
     * The top-level container for a Famous-renderable piece of the document.
     *   It is directly updated by the process-wide Engine object, and manages one
     *   render tree root, which can contain other renderables.
     *
     * @class Context
     * @constructor
     * @private
     * @param {Node} container Element in which content will be inserted
     */
    function Context(container) {
        this.container = container;
        this._allocator = new ElementAllocator(container);

        this._node = new RenderNode();
        this._eventOutput = new EventHandler();
        this._size = _getElementSize(this.container);

        this._perspectiveState = new Transitionable(0);
        this._perspective = undefined;

        this._nodeContext = {
            allocator: this._allocator,
            transform: Transform.identity,
            opacity: 1,
            origin: _originZeroZero,
            size: this._size
        };

        this._eventOutput.on('resize', function() {
            this.setSize(_getElementSize(this.container));
        }.bind(this));

    }

    // Note: Unused
    Context.prototype.getAllocator = function getAllocator() {
        return this._allocator;
    };

    /**
     * Add renderables to this Context's render tree.
     *
     * @method add
     *
     * @param {Object} obj renderable object
     * @return {RenderNode} RenderNode wrapping this object, if not already a RenderNode
     */
    Context.prototype.add = function add(obj) {
        return this._node.add(obj);
    };

    /**
     * Move this Context to another containing document element.
     *
     * @method migrate
     *
     * @param {Node} container Element to which content will be migrated
     */
    Context.prototype.migrate = function migrate(container) {
        if (container === this.container) return;
        this.container = container;
        this._allocator.migrate(container);
    };

    /**
     * Gets viewport size for Context.
     *
     * @method getSize
     *
     * @return {Array.Number} viewport size as [width, height]
     */
    Context.prototype.getSize = function getSize() {
        return this._size;
    };

    /**
     * Sets viewport size for Context.
     *
     * @method setSize
     *
     * @param {Array.Number} size [width, height].  If unspecified, use size of root document element.
     */
    Context.prototype.setSize = function setSize(size) {
        if (!size) size = _getElementSize(this.container);
        this._size[0] = size[0];
        this._size[1] = size[1];
    };

    /**
     * Commit this Context's content changes to the document.
     *
     * @private
     * @method update
     * @param {Object} contextParameters engine commit specification
     */
    Context.prototype.update = function update(contextParameters) {
        if (contextParameters) {
            if (contextParameters.transform) this._nodeContext.transform = contextParameters.transform;
            if (contextParameters.opacity) this._nodeContext.opacity = contextParameters.opacity;
            if (contextParameters.origin) this._nodeContext.origin = contextParameters.origin;
            if (contextParameters.size) this._nodeContext.size = contextParameters.size;
        }
        var perspective = this._perspectiveState.get();
        if (perspective !== this._perspective) {
            this.container.style.perspective = perspective ? perspective.toFixed() + 'px' : '';
            this.container.style.webkitPerspective = perspective ? perspective.toFixed() : '';
            this._perspective = perspective;
        }

        this._node.commit(this._nodeContext);
    };

    /**
     * Get current perspective of this context in pixels.
     *
     * @method getPerspective
     * @return {Number} depth perspective in pixels
     */
    Context.prototype.getPerspective = function getPerspective() {
        return this._perspectiveState.get();
    };

    /**
     * Set current perspective of this context in pixels.
     *
     * @method getPerspective
     * @param {Number} perspective in pixels
     * @param {Object} [transition] Transitionable object for applying the change
     * @param {function(Object)} callback function called on completion of transition
     */
    Context.prototype.setPerspective = function setPerspective(perspective, transition, callback) {
        return this._perspectiveState.set(perspective, transition, callback);
    };

    /**
     * Trigger an event, sending to all downstream handlers
     *   listening for provided 'type' key.
     *
     * @method emit
     *
     * @param {string} type event type key (for example, 'click')
     * @param {Object} event event data
     * @return {EventHandler} this
     */
    Context.prototype.emit = function emit(type, event) {
        return this._eventOutput.emit(type, event);
    };

    /**
     * Bind a callback function to an event type handled by this object.
     *
     * @method "on"
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function(string, Object)} handler callback
     * @return {EventHandler} this
     */
    Context.prototype.on = function on(type, handler) {
        return this._eventOutput.on(type, handler);
    };

    /**
     * Unbind an event by type and handler.
     *   This undoes the work of "on".
     *
     * @method removeListener
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function} handler function object to remove
     * @return {EventHandler} internal event handler object (for chaining)
     */
    Context.prototype.removeListener = function removeListener(type, handler) {
        return this._eventOutput.removeListener(type, handler);
    };

    /**
     * Add event handler object to set of downstream handlers.
     *
     * @method pipe
     *
     * @param {EventHandler} target event handler target object
     * @return {EventHandler} passed event handler
     */
    Context.prototype.pipe = function pipe(target) {
        return this._eventOutput.pipe(target);
    };

    /**
     * Remove handler object from set of downstream handlers.
     *   Undoes work of "pipe".
     *
     * @method unpipe
     *
     * @param {EventHandler} target target handler object
     * @return {EventHandler} provided target
     */
    Context.prototype.unpipe = function unpipe(target) {
        return this._eventOutput.unpipe(target);
    };

    module.exports = Context;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/OptionsManager',['require','exports','module','./EventHandler'],function(require, exports, module) {
    var EventHandler = require('./EventHandler');

    /**
     *  A collection of methods for setting options which can be extended
     *  onto other classes.
     *
     *
     *  **** WARNING ****
     *  You can only pass through objects that will compile into valid JSON.
     *
     *  Valid options:
     *      Strings,
     *      Arrays,
     *      Objects,
     *      Numbers,
     *      Nested Objects,
     *      Nested Arrays.
     *
     *    This excludes:
     *        Document Fragments,
     *        Functions
     * @class OptionsManager
     * @constructor
     * @param {Object} value options dictionary
     */
    function OptionsManager(value) {
        this._value = value;
        this.eventOutput = null;
    }

    /**
     * Create options manager from source dictionary with arguments overriden by patch dictionary.
     *
     * @static
     * @method OptionsManager.patch
     *
     * @param {Object} source source arguments
     * @param {...Object} data argument additions and overwrites
     * @return {Object} source object
     */
    OptionsManager.patch = function patchObject(source, data) {
        var manager = new OptionsManager(source);
        for (var i = 1; i < arguments.length; i++) manager.patch(arguments[i]);
        return source;
    };

    function _createEventOutput() {
        this.eventOutput = new EventHandler();
        this.eventOutput.bindThis(this);
        EventHandler.setOutputHandler(this, this.eventOutput);
    }

    /**
     * Create OptionsManager from source with arguments overriden by patches.
     *   Triggers 'change' event on this object's event handler if the state of
     *   the OptionsManager changes as a result.
     *
     * @method patch
     *
     * @param {...Object} arguments list of patch objects
     * @return {OptionsManager} this
     */
    OptionsManager.prototype.patch = function patch() {
        var myState = this._value;
        for (var i = 0; i < arguments.length; i++) {
            var data = arguments[i];
            for (var k in data) {
                if ((k in myState) && (data[k] && data[k].constructor === Object) && (myState[k] && myState[k].constructor === Object)) {
                    if (!myState.hasOwnProperty(k)) myState[k] = Object.create(myState[k]);
                    this.key(k).patch(data[k]);
                    if (this.eventOutput) this.eventOutput.emit('change', {id: k, value: this.key(k).value()});
                }
                else this.set(k, data[k]);
            }
        }
        return this;
    };

    /**
     * Alias for patch
     *
     * @method setOptions
     *
     */
    OptionsManager.prototype.setOptions = OptionsManager.prototype.patch;

    /**
     * Return OptionsManager based on sub-object retrieved by key
     *
     * @method key
     *
     * @param {string} identifier key
     * @return {OptionsManager} new options manager with the value
     */
    OptionsManager.prototype.key = function key(identifier) {
        var result = new OptionsManager(this._value[identifier]);
        if (!(result._value instanceof Object) || result._value instanceof Array) result._value = {};
        return result;
    };

    /**
     * Look up value by key
     * @method get
     *
     * @param {string} key key
     * @return {Object} associated object
     */
    OptionsManager.prototype.get = function get(key) {
        return this._value[key];
    };

    /**
     * Alias for get
     * @method getOptions
     */
    OptionsManager.prototype.getOptions = OptionsManager.prototype.get;

    /**
     * Set key to value.  Outputs 'change' event if a value is overwritten.
     *
     * @method set
     *
     * @param {string} key key string
     * @param {Object} value value object
     * @return {OptionsManager} new options manager based on the value object
     */
    OptionsManager.prototype.set = function set(key, value) {
        var originalValue = this.get(key);
        this._value[key] = value;
        if (this.eventOutput && value !== originalValue) this.eventOutput.emit('change', {id: key, value: value});
        return this;
    };

    /**
     * Return entire object contents of this OptionsManager.
     *
     * @method value
     *
     * @return {Object} current state of options
     */
    OptionsManager.prototype.value = function value() {
        return this._value;
    };

    /**
     * Bind a callback function to an event type handled by this object.
     *
     * @method "on"
     *
     * @param {string} type event type key (for example, 'change')
     * @param {function(string, Object)} handler callback
     * @return {EventHandler} this
     */
    OptionsManager.prototype.on = function on() {
        _createEventOutput.call(this);
        return this.on.apply(this, arguments);
    };

    /**
     * Unbind an event by type and handler.
     *   This undoes the work of "on".
     *
     * @method removeListener
     *
     * @param {string} type event type key (for example, 'change')
     * @param {function} handler function object to remove
     * @return {EventHandler} internal event handler object (for chaining)
     */
    OptionsManager.prototype.removeListener = function removeListener() {
        _createEventOutput.call(this);
        return this.removeListener.apply(this, arguments);
    };

    /**
     * Add event handler object to set of downstream handlers.
     *
     * @method pipe
     *
     * @param {EventHandler} target event handler target object
     * @return {EventHandler} passed event handler
     */
    OptionsManager.prototype.pipe = function pipe() {
        _createEventOutput.call(this);
        return this.pipe.apply(this, arguments);
    };

    /**
     * Remove handler object from set of downstream handlers.
     * Undoes work of "pipe"
     *
     * @method unpipe
     *
     * @param {EventHandler} target target handler object
     * @return {EventHandler} provided target
     */
    OptionsManager.prototype.unpipe = function unpipe() {
        _createEventOutput.call(this);
        return this.unpipe.apply(this, arguments);
    };

    module.exports = OptionsManager;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Engine',['require','exports','module','./Context','./EventHandler','./OptionsManager'],function(require, exports, module) {

    /**
     * The singleton object initiated upon process
     *   startup which manages all active Context instances, runs
     *   the render dispatch loop, and acts as a listener and dispatcher
     *   for events.  All methods are therefore static.
     *
     *   On static initialization, window.requestAnimationFrame is called with
     *     the event loop function.
     *
     *   Note: Any window in which Engine runs will prevent default
     *     scrolling behavior on the 'touchmove' event.
     *
     * @static
     * @class Engine
     */
    var Context = require('./Context');
    var EventHandler = require('./EventHandler');
    var OptionsManager = require('./OptionsManager');

    var Engine = {};

    var contexts = [];
    var nextTickQueue = [];
    var deferQueue = [];

    var lastTime = Date.now();
    var frameTime;
    var frameTimeLimit;
    var loopEnabled = true;
    var eventForwarders = {};
    var eventHandler = new EventHandler();

    var options = {
        containerType: 'div',
        containerClass: 'famous-container',
        fpsCap: undefined,
        runLoop: true
    };
    var optionsManager = new OptionsManager(options);

    /** @const */
    var MAX_DEFER_FRAME_TIME = 10;

    /**
     * Inside requestAnimationFrame loop, step() is called, which:
     *   calculates current FPS (throttling loop if it is over limit set in setFPSCap),
     *   emits dataless 'prerender' event on start of loop,
     *   calls in order any one-shot functions registered by nextTick on last loop,
     *   calls Context.update on all Context objects registered,
     *   and emits dataless 'postrender' event on end of loop.
     *
     * @static
     * @private
     * @method step
     */
    Engine.step = function step() {
        var currentTime = Date.now();

        // skip frame if we're over our framerate cap
        if (frameTimeLimit && currentTime - lastTime < frameTimeLimit) return;

        var i = 0;

        frameTime = currentTime - lastTime;
        lastTime = currentTime;

        eventHandler.emit('prerender');

        // empty the queue
        for (i = 0; i < nextTickQueue.length; i++) nextTickQueue[i].call(this);
        nextTickQueue.splice(0);

        // limit total execution time for deferrable functions
        while (deferQueue.length && (Date.now() - currentTime) < MAX_DEFER_FRAME_TIME) {
            deferQueue.shift().call(this);
        }

        for (i = 0; i < contexts.length; i++) contexts[i].update();

        eventHandler.emit('postrender');
    };

    // engage requestAnimationFrame
    function loop() {
        if (options.runLoop) {
            Engine.step();
            requestAnimationFrame(loop);
        }
        else loopEnabled = false;
    }
    requestAnimationFrame(loop);

    //
    // Upon main document window resize (unless on an "input" HTML element):
    //   scroll to the top left corner of the window,
    //   and for each managed Context: emit the 'resize' event and update its size.
    // @param {Object=} event document event
    //
    function handleResize(event) {
        if (document.activeElement && document.activeElement.nodeName === 'INPUT') {
            document.activeElement.addEventListener('blur', function deferredResize() {
                this.removeEventListener('blur', deferredResize);
                handleResize(event);
            });
            return;
        }
        window.scrollTo(0, 0);
        for (var i = 0; i < contexts.length; i++) {
            contexts[i].emit('resize');
        }
        eventHandler.emit('resize');
    }
    window.addEventListener('resize', handleResize, false);
    handleResize();

    // prevent scrolling via browser
    window.addEventListener('touchmove', function(event) {
        event.preventDefault();
    }, true);

    /**
     * Add event handler object to set of downstream handlers.
     *
     * @method pipe
     *
     * @param {EventHandler} target event handler target object
     * @return {EventHandler} passed event handler
     */
    Engine.pipe = function pipe(target) {
        if (target.subscribe instanceof Function) return target.subscribe(Engine);
        else return eventHandler.pipe(target);
    };

    /**
     * Remove handler object from set of downstream handlers.
     *   Undoes work of "pipe".
     *
     * @method unpipe
     *
     * @param {EventHandler} target target handler object
     * @return {EventHandler} provided target
     */
    Engine.unpipe = function unpipe(target) {
        if (target.unsubscribe instanceof Function) return target.unsubscribe(Engine);
        else return eventHandler.unpipe(target);
    };

    /**
     * Bind a callback function to an event type handled by this object.
     *
     * @static
     * @method "on"
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function(string, Object)} handler callback
     * @return {EventHandler} this
     */
    Engine.on = function on(type, handler) {
        if (!(type in eventForwarders)) {
            eventForwarders[type] = eventHandler.emit.bind(eventHandler, type);
            document.body.addEventListener(type, eventForwarders[type]);
        }
        return eventHandler.on(type, handler);
    };

    /**
     * Trigger an event, sending to all downstream handlers
     *   listening for provided 'type' key.
     *
     * @method emit
     *
     * @param {string} type event type key (for example, 'click')
     * @param {Object} event event data
     * @return {EventHandler} this
     */
    Engine.emit = function emit(type, event) {
        return eventHandler.emit(type, event);
    };

    /**
     * Unbind an event by type and handler.
     *   This undoes the work of "on".
     *
     * @static
     * @method removeListener
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function} handler function object to remove
     * @return {EventHandler} internal event handler object (for chaining)
     */
    Engine.removeListener = function removeListener(type, handler) {
        return eventHandler.removeListener(type, handler);
    };

    /**
     * Return the current calculated frames per second of the Engine.
     *
     * @static
     * @method getFPS
     *
     * @return {Number} calculated fps
     */
    Engine.getFPS = function getFPS() {
        return 1000 / frameTime;
    };

    /**
     * Set the maximum fps at which the system should run. If internal render
     *    loop is called at a greater frequency than this FPSCap, Engine will
     *    throttle render and update until this rate is achieved.
     *
     * @static
     * @method setFPSCap
     *
     * @param {Number} fps maximum frames per second
     */
    Engine.setFPSCap = function setFPSCap(fps) {
        frameTimeLimit = Math.floor(1000 / fps);
    };

    /**
     * Return engine options.
     *
     * @static
     * @method getOptions
     * @param {string} key
     * @return {Object} engine options
     */
    Engine.getOptions = function getOptions() {
        return optionsManager.getOptions.apply(optionsManager, arguments);
    };

    /**
     * Set engine options
     *
     * @static
     * @method setOptions
     *
     * @param {Object} [options] overrides of default options
     * @param {Number} [options.fpsCap]  maximum fps at which the system should run
     * @param {boolean} [options.runLoop=true] whether the run loop should continue
     * @param {string} [options.containerType="div"] type of container element.  Defaults to 'div'.
     * @param {string} [options.containerClass="famous-container"] type of container element.  Defaults to 'famous-container'.
     */
    Engine.setOptions = function setOptions(options) {
        return optionsManager.setOptions.apply(optionsManager, arguments);
    };

    /**
     * Creates a new Context for rendering and event handling with
     *    provided document element as top of each tree. This will be tracked by the
     *    process-wide Engine.
     *
     * @static
     * @method createContext
     *
     * @param {Node} el will be top of Famo.us document element tree
     * @return {Context} new Context within el
     */
    Engine.createContext = function createContext(el) {
        if (el === undefined) {
            el = document.createElement(options.containerType);
            el.classList.add(options.containerClass);
            document.body.appendChild(el);
        }
        else if (!(el instanceof Element)) {
            el = document.createElement(options.containerType);
            throw new Error('Tried to create context on non-existent element');
        }
        var context = new Context(el);
        Engine.registerContext(context);
        return context;
    };

    /**
     * Registers an existing context to be updated within the run loop.
     *
     * @static
     * @method registerContext
     *
     * @param {Context} context Context to register
     * @return {FamousContext} provided context
     */
    Engine.registerContext = function registerContext(context) {
        contexts.push(context);
        return context;
    };

    /**
     * Queue a function to be executed on the next tick of the
     *    Engine.
     *
     * @static
     * @method nextTick
     *
     * @param {function(Object)} fn function accepting window object
     */
    Engine.nextTick = function nextTick(fn) {
        nextTickQueue.push(fn);
    };

    /**
     * Queue a function to be executed sometime soon, at a time that is
     *    unlikely to affect frame rate.
     *
     * @static
     * @method defer
     *
     * @param {Function} fn
     */
    Engine.defer = function defer(fn) {
        deferQueue.push(fn);
    };

    optionsManager.on('change', function(data) {
        if (data.id === 'fpsCap') Engine.setFPSCap(data.value);
        else if (data.id === 'runLoop') {
            // kick off the loop only if it was stopped
            if (!loopEnabled && data.value) {
                loopEnabled = true;
                requestAnimationFrame(loop);
            }
        }
    });

    module.exports = Engine;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Surface',['require','exports','module','./Entity','./EventHandler','./Transform'],function(require, exports, module) {
    var Entity = require('./Entity');
    var EventHandler = require('./EventHandler');
    var Transform = require('./Transform');

    var usePrefix = document.body.style.webkitTransform !== undefined;

    /**
     * A base class for viewable content and event
     *   targets inside a Famo.us application, containing a renderable document
     *   fragment. Like an HTML div, it can accept internal markup,
     *   properties, classes, and handle events.
     *
     * @class Surface
     * @constructor
     *
     * @param {Object} [options] default option overrides
     * @param {Array.Number} [options.size] [width, height] in pixels
     * @param {Array.string} [options.classes] CSS classes to set on inner content
     * @param {Array} [options.properties] string dictionary of HTML attributes to set on target div
     * @param {string} [options.content] inner (HTML) content of surface
     */
    function Surface(options) {
        this.options = {};

        this.properties = {};
        this.content = '';
        this.classList = [];
        this.size = null;

        this._classesDirty = true;
        this._stylesDirty = true;
        this._sizeDirty = true;
        this._contentDirty = true;

        this._dirtyClasses = [];

        this._matrix = null;
        this._opacity = 1;
        this._origin = null;
        this._size = null;

        /** @ignore */
        this.eventForwarder = function eventForwarder(event) {
            this.emit(event.type, event);
        }.bind(this);
        this.eventHandler = new EventHandler();
        this.eventHandler.bindThis(this);

        this.id = Entity.register(this);

        if (options) this.setOptions(options);

        this._currTarget = null;
    }
    Surface.prototype.elementType = 'div';
    Surface.prototype.elementClass = 'famous-surface';

    /**
     * Bind a callback function to an event type handled by this object.
     *
     * @method "on"
     *
     * @param {string} type event type key (for example, 'click')
     * @param {function(string, Object)} fn handler callback
     * @return {EventHandler} this
     */
    Surface.prototype.on = function on(type, fn) {
        if (this._currTarget) this._currTarget.addEventListener(type, this.eventForwarder);
        this.eventHandler.on(type, fn);
    };

    /**
     * Unbind an event by type and handler.
     *   This undoes the work of "on"
     *
     * @method removeListener
     * @param {string} type event type key (for example, 'click')
     * @param {function(string, Object)} fn handler
     */
    Surface.prototype.removeListener = function removeListener(type, fn) {
        this.eventHandler.removeListener(type, fn);
    };

    /**
     * Trigger an event, sending to all downstream handlers
     *   listening for provided 'type' key.
     *
     * @method emit
     *
     * @param {string} type event type key (for example, 'click')
     * @param {Object} event event data
     * @return {EventHandler} this
     */
    Surface.prototype.emit = function emit(type, event) {
        if (event && !event.origin) event.origin = this;
        var handled = this.eventHandler.emit(type, event);
        if (handled && event.stopPropagation) event.stopPropagation();
        return handled;
    };

    /**
     * Add event handler object to set of downstream handlers.
     *
     * @method pipe
     *
     * @param {EventHandler} target event handler target object
     * @return {EventHandler} passed event handler
     */
    Surface.prototype.pipe = function pipe(target) {
        return this.eventHandler.pipe(target);
    };

    /**
     * Remove handler object from set of downstream handlers.
     *   Undoes work of "pipe"
     *
     * @method unpipe
     *
     * @param {EventHandler} target target handler object
     * @return {EventHandler} provided target
     */
    Surface.prototype.unpipe = function unpipe(target) {
        return this.eventHandler.unpipe(target);
    };

    /**
     * Return spec for this surface. Note that for a base surface, this is
     *    simply an id.
     *
     * @method render
     * @private
     * @return {Object} render spec for this surface (spec id)
     */
    Surface.prototype.render = function render() {
        return this.id;
    };

    /**
     * Set CSS-style properties on this Surface. Note that this will cause
     *    dirtying and thus re-rendering, even if values do not change.
     *
     * @method setProperties
     * @param {Object} properties property dictionary of "key" => "value"
     */
    Surface.prototype.setProperties = function setProperties(properties) {
        for (var n in properties) {
            this.properties[n] = properties[n];
        }
        this._stylesDirty = true;
    };

    /**
     * Get CSS-style properties on this Surface.
     *
     * @method getProperties
     *
     * @return {Object} Dictionary of this Surface's properties.
     */
    Surface.prototype.getProperties = function getProperties() {
        return this.properties;
    };

    /**
     * Add CSS-style class to the list of classes on this Surface. Note
     *   this will map directly to the HTML property of the actual
     *   corresponding rendered <div>.
     *
     * @method addClass
     * @param {string} className name of class to add
     */
    Surface.prototype.addClass = function addClass(className) {
        if (this.classList.indexOf(className) < 0) {
            this.classList.push(className);
            this._classesDirty = true;
        }
    };

    /**
     * Remove CSS-style class from the list of classes on this Surface.
     *   Note this will map directly to the HTML property of the actual
     *   corresponding rendered <div>.
     *
     * @method removeClass
     * @param {string} className name of class to remove
     */
    Surface.prototype.removeClass = function removeClass(className) {
        var i = this.classList.indexOf(className);
        if (i >= 0) {
            this._dirtyClasses.push(this.classList.splice(i, 1)[0]);
            this._classesDirty = true;
        }
    };

    /**
     * Reset class list to provided dictionary.
     * @method setClasses
     * @param {Array.string} classList
     */
    Surface.prototype.setClasses = function setClasses(classList) {
        var i = 0;
        var removal = [];
        for (i = 0; i < this.classList.length; i++) {
            if (classList.indexOf(this.classList[i]) < 0) removal.push(this.classList[i]);
        }
        for (i = 0; i < removal.length; i++) this.removeClass(removal[i]);
        // duplicates are already checked by addClass()
        for (i = 0; i < classList.length; i++) this.addClass(classList[i]);
    };

    /**
     * Get array of CSS-style classes attached to this div.
     *
     * @method getClasslist
     * @return {Array.string} array of class names
     */
    Surface.prototype.getClassList = function getClassList() {
        return this.classList;
    };

    /**
     * Set or overwrite inner (HTML) content of this surface. Note that this
     *    causes a re-rendering if the content has changed.
     *
     * @method setContent
     * @param {string} content HTML content
     */
    Surface.prototype.setContent = function setContent(content) {
        if (this.content !== content) {
            this.content = content;
            this._contentDirty = true;
        }
    };

    /**
     * Return inner (HTML) content of this surface.
     *
     * @method getContent
     *
     * @return {string} inner (HTML) content
     */
    Surface.prototype.getContent = function getContent() {
        return this.content;
    };

    /**
     * Set options for this surface
     *
     * @method setOptions
     * @param {Object} [options] overrides for default options.  See constructor.
     */
    Surface.prototype.setOptions = function setOptions(options) {
        if (options.size) this.setSize(options.size);
        if (options.classes) this.setClasses(options.classes);
        if (options.properties) this.setProperties(options.properties);
        if (options.content) this.setContent(options.content);
    };

    //  Attach Famous event handling to document events emanating from target
    //    document element.  This occurs just after deployment to the document.
    //    Calling this enables methods like #on and #pipe.
    function _addEventListeners(target) {
        for (var i in this.eventHandler.listeners) {
            target.addEventListener(i, this.eventForwarder);
        }
    }

    //  Detach Famous event handling from document events emanating from target
    //  document element.  This occurs just before recall from the document.
    function _removeEventListeners(target) {
        for (var i in this.eventHandler.listeners) {
            target.removeEventListener(i, this.eventForwarder);
        }
    }

     //  Apply to document all changes from removeClass() since last setup().
    function _cleanupClasses(target) {
        for (var i = 0; i < this._dirtyClasses.length; i++) target.classList.remove(this._dirtyClasses[i]);
        this._dirtyClasses = [];
    }

    // Apply values of all Famous-managed styles to the document element.
    //  These will be deployed to the document on call to #setup().
    function _applyStyles(target) {
        for (var n in this.properties) {
            target.style[n] = this.properties[n];
        }
    }

    // Clear all Famous-managed styles from the document element.
    // These will be deployed to the document on call to #setup().
    function _cleanupStyles(target) {
        for (var n in this.properties) {
            target.style[n] = '';
        }
    }

    /**
     * Return a Matrix's webkit css representation to be used with the
     *    CSS3 -webkit-transform style.
     *    Example: -webkit-transform: matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,716,243,0,1)
     *
     * @method _formatCSSTransform
     * @private
     * @param {FamousMatrix} m matrix
     * @return {string} matrix3d CSS style representation of the transform
     */
    function _formatCSSTransform(m) {
        var result = 'matrix3d(';
        for (var i = 0; i < 15; i++) {
            result += (m[i] < 0.000001 && m[i] > -0.000001) ? '0,' : m[i] + ',';
        }
        result += m[15] + ')';
        return result;
    }

    /**
     * Directly apply given FamousMatrix to the document element as the
     *   appropriate webkit CSS style.
     *
     * @method setMatrix
     *
     * @static
     * @private
     * @param {Element} element document element
     * @param {FamousMatrix} matrix
     */

    var _setMatrix = usePrefix ? function(element, matrix) {
        element.style.webkitTransform = _formatCSSTransform(matrix);
    } : function(element, matrix) {
        element.style.transform = _formatCSSTransform(matrix);
    };

    // format origin as CSS percentage string
    function _formatCSSOrigin(origin) {
        return (100 * origin[0]).toFixed(6) + '% ' + (100 * origin[1]).toFixed(6) + '%';
    }

     // Directly apply given origin coordinates to the document element as the
     // appropriate webkit CSS style.
    var _setOrigin = usePrefix ? function(element, origin) {
        element.style.webkitTransformOrigin = _formatCSSOrigin(origin);
    } : function(element, origin) {
        element.style.transformOrigin = _formatCSSOrigin(origin);
    };

     // Shrink given document element until it is effectively invisible.
    var _setInvisible = usePrefix ? function(element) {
        element.style.webkitTransform = 'scale3d(0.0001,0.0001,1)';
        element.style.opacity = 0;
    } : function(element) {
        element.style.transform = 'scale3d(0.0001,0.0001,1)';
        element.style.opacity = 0;
    };

    function _xyNotEquals(a, b) {
        return (a && b) ? (a[0] !== b[0] || a[1] !== b[1]) : a !== b;
    }

    /**
     * One-time setup for an element to be ready for commits to document.
     *
     * @private
     * @method setup
     *
     * @param {ElementAllocator} allocator document element pool for this context
     */
    Surface.prototype.setup = function setup(allocator) {
        var target = allocator.allocate(this.elementType);
        if (this.elementClass) {
            if (this.elementClass instanceof Array) {
                for (var i = 0; i < this.elementClass.length; i++) {
                    target.classList.add(this.elementClass[i]);
                }
            }
            else {
                target.classList.add(this.elementClass);
            }
        }
        target.style.display = '';
        _addEventListeners.call(this, target);
        _setOrigin(target, [0, 0]); // handled internally
        this._currTarget = target;
        this._stylesDirty = true;
        this._classesDirty = true;
        this._sizeDirty = true;
        this._contentDirty = true;
        this._matrix = null;
        this._opacity = undefined;
        this._origin = null;
        this._size = null;
    };

    /**
     * Apply changes from this component to the corresponding document element.
     * This includes changes to classes, styles, size, content, opacity, origin,
     * and matrix transforms.
     *
     * @private
     * @method commit
     * @param {Context} context commit context
     */
    Surface.prototype.commit = function commit(context) {
        if (!this._currTarget) this.setup(context.allocator);
        var target = this._currTarget;

        var matrix = context.transform;
        var opacity = context.opacity;
        var origin = context.origin;
        var size = context.size;

        if (this.size) {
            var origSize = size;
            size = [this.size[0], this.size[1]];
            if (size[0] === undefined && origSize[0]) size[0] = origSize[0];
            if (size[1] === undefined && origSize[1]) size[1] = origSize[1];
        }

        if (_xyNotEquals(this._size, size)) {
            this._size = [size[0], size[1]];
            this._sizeDirty = true;
        }

        if (!matrix && this._matrix) {
            this._matrix = null;
            this._opacity = 0;
            _setInvisible(target);
            return;
        }

        if (this._opacity !== opacity) {
            this._opacity = opacity;
            target.style.opacity = (opacity >= 1) ? '0.999999' : opacity;
        }

        if (_xyNotEquals(this._origin, origin) || Transform.notEquals(this._matrix, matrix)) {
            if (!matrix) matrix = Transform.identity;
            this._matrix = matrix;
            var aaMatrix = matrix;
            if (origin) {
                if (!this._origin) this._origin = [0, 0];
                this._origin[0] = origin[0];
                this._origin[1] = origin[1];
                aaMatrix = Transform.moveThen([-this._size[0] * origin[0], -this._size[1] * origin[1], 0], matrix);
            }
            _setMatrix(target, aaMatrix);
        }

        if (!(this._classesDirty || this._stylesDirty || this._sizeDirty || this._contentDirty)) return;

        if (this._classesDirty) {
            _cleanupClasses.call(this, target);
            var classList = this.getClassList();
            for (var i = 0; i < classList.length; i++) target.classList.add(classList[i]);
            this._classesDirty = false;
        }
        if (this._stylesDirty) {
            _applyStyles.call(this, target);
            this._stylesDirty = false;
        }
        if (this._sizeDirty) {
            if (this._size) {
                target.style.width = (this._size[0] !== true) ? this._size[0] + 'px' : '';
                target.style.height = (this._size[1] !== true) ? this._size[1] + 'px' : '';
            }
            this._sizeDirty = false;
        }
        if (this._contentDirty) {
            this.deploy(target);
            this.eventHandler.emit('deploy');
            this._contentDirty = false;
        }
    };

    /**
     *  Remove all Famous-relevant attributes from a document element.
     *    This is called by SurfaceManager's detach().
     *    This is in some sense the reverse of .deploy().
     *
     * @private
     * @method cleanup
     * @param {ElementAllocator} allocator
     */
    Surface.prototype.cleanup = function cleanup(allocator) {
        var i = 0;
        var target = this._currTarget;
        this.eventHandler.emit('recall');
        this.recall(target);
        target.style.display = 'none';
        target.style.width = '';
        target.style.height = '';
        this._size = null;
        _cleanupStyles.call(this, target);
        var classList = this.getClassList();
        _cleanupClasses.call(this, target);
        for (i = 0; i < classList.length; i++) target.classList.remove(classList[i]);
        if (this.elementClass) {
            if (this.elementClass instanceof Array) {
                for (i = 0; i < this.elementClass.length; i++) {
                    target.classList.remove(this.elementClass[i]);
                }
            }
            else {
                target.classList.remove(this.elementClass);
            }
        }
        _removeEventListeners.call(this, target);
        this._currTarget = null;
        allocator.deallocate(target);
        _setInvisible(target);
    };

    /**
     * Place the document element that this component manages into the document.
     *
     * @private
     * @method deploy
     * @param {Node} target document parent of this container
     */
    Surface.prototype.deploy = function deploy(target) {
        var content = this.getContent();
        if (content instanceof Node) {
            while (target.hasChildNodes()) target.removeChild(target.firstChild);
            target.appendChild(content);
        }
        else target.innerHTML = content;
    };

    /**
     * Remove any contained document content associated with this surface
     *   from the actual document.
     *
     * @private
     * @method recall
     */
    Surface.prototype.recall = function recall(target) {
        var df = document.createDocumentFragment();
        while (target.hasChildNodes()) df.appendChild(target.firstChild);
        this.setContent(df);
    };

    /**
     *  Get the x and y dimensions of the surface.
     *
     * @method getSize
     * @param {boolean} actual return computed size rather than provided
     * @return {Array.Number} [x,y] size of surface
     */
    Surface.prototype.getSize = function getSize(actual) {
        return actual ? this._size : (this.size || this._size);
    };

    /**
     * Set x and y dimensions of the surface.
     *
     * @method setSize
     * @param {Array.Number} size as [width, height]
     */
    Surface.prototype.setSize = function setSize(size) {
        this.size = size ? [size[0], size[1]] : null;
        this._sizeDirty = true;
    };

    module.exports = Surface;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/transitions/TransitionableTransform',['require','exports','module','./Transitionable','famous/core/Transform','famous/utilities/Utility'],function(require, exports, module) {
    var Transitionable = require('./Transitionable');
    var Transform = require('famous/core/Transform');
    var Utility = require('famous/utilities/Utility');

    /**
     * A class for transitioning the state of a Transform by transitioning
     * its translate, scale, skew and rotate components independently.
     *
     * @class TransitionableTransform
     * @constructor
     *
     * @param [transform=Transform.identity] {Transform} The initial transform state
     */
    function TransitionableTransform(transform) {
        this._final = Transform.identity.slice();
        this.translate = new Transitionable([0, 0, 0]);
        this.rotate = new Transitionable([0, 0, 0]);
        this.skew = new Transitionable([0, 0, 0]);
        this.scale = new Transitionable([1, 1, 1]);

        if (transform) this.set(transform);
    }

    function _build() {
        return Transform.build({
            translate: this.translate.get(),
            rotate: this.rotate.get(),
            skew: this.skew.get(),
            scale: this.scale.get()
        });
    }

    /**
     * An optimized way of setting only the translation component of a Transform
     *
     * @method setTranslate
     * @chainable
     *
     * @param translate {Array}     New translation state
     * @param [transition] {Object} Transition definition
     * @param [callback] {Function} Callback
     * @return {TransitionableTransform}
     */
    TransitionableTransform.prototype.setTranslate = function setTranslate(translate, transition, callback) {
        this.translate.set(translate, transition, callback);
        this._final = this._final.slice();
        this._final[12] = translate[0];
        this._final[13] = translate[1];
        if (translate[2] !== undefined) this._final[14] = translate[2];
        return this;
    };

    /**
     * An optimized way of setting only the scale component of a Transform
     *
     * @method setTranslate
     * @chainable
     *
     * @param scale {Array}         New scale state
     * @param [transition] {Object} Transition definition
     * @param [callback] {Function} Callback
     * @return {TransitionableTransform}
     */
    TransitionableTransform.prototype.setScale = function setScale(scale, transition, callback) {
        this.scale.set(scale, transition, callback);
        this._final = this._final.slice();
        this._final[0] = scale[0];
        this._final[5] = scale[1];
        if (scale[2] !== undefined) this._final[10] = scale[2];
        return this;
    };

    /**
     * An optimized way of setting only the rotational component of a Transform
     *
     * @method setTranslate
     * @chainable
     *
     * @param eulerAngles {Array}   Euler angles for new rotation state
     * @param [transition] {Object} Transition definition
     * @param [callback] {Function} Callback
     * @return {TransitionableTransform}
     */
    TransitionableTransform.prototype.setRotate = function setRotate(eulerAngles, transition, callback) {
        this.rotate.set(eulerAngles, transition, callback);
        this._final = _build.call(this);
        this._final = Transform.build({
            translate: this.translate.get(),
            rotate: eulerAngles,
            scale: this.scale.get(),
            skew: this.skew.get()
        });
        return this;
    };

    /**
     * An optimized way of setting only the skew component of a Transform
     *
     * @method setTranslate
     * @chainable
     *
     * @param skewAngles {Array}    New skew state
     * @param [transition] {Object} Transition definition
     * @param [callback] {Function} Callback
     * @return {TransitionableTransform}
     */
    TransitionableTransform.prototype.setSkew = function setSkew(skewAngles, transition, callback) {
        this.skew.set(skewAngles, transition, callback);
        this._final = Transform.build({
            translate: this.translate.get(),
            rotate: this.rotate.get(),
            scale: this.scale.get(),
            skew: skewAngles
        });
        return this;
    };

    /**
     * Setter for a TransitionableTransform with optional parameters to transition
     * between Transforms
     *
     * @method setTranslate
     * @chainable
     *
     * @param transform {Array}     New transform state
     * @param [transition] {Object} Transition definition
     * @param [callback] {Function} Callback
     * @return {TransitionableTransform}
     */
    TransitionableTransform.prototype.set = function set(transform, transition, callback) {
        this._final = transform;
        var components = Transform.interpret(transform);

        var _callback = callback ? Utility.after(4, callback) : null;
        this.translate.set(components.translate, transition, _callback);
        this.rotate.set(components.rotate, transition, _callback);
        this.skew.set(components.skew, transition, _callback);
        this.scale.set(components.scale, transition, _callback);
        return this;
    };

    /**
     * Sets the default transition to use for transitioning betwen Transform states
     *
     * @method setDefaultTransition
     *
     * @param transition {Object} Transition definition
     */
    TransitionableTransform.prototype.setDefaultTransition = function setDefaultTransition(transition) {
        this.translate.setDefault(transition);
        this.rotate.setDefault(transition);
        this.skew.setDefault(transition);
        this.scale.setDefault(transition);
    };

    /**
     * Getter. Returns the current state of the Transform
     *
     * @method get
     *
     * @return {Transform}
     */
    TransitionableTransform.prototype.get = function get() {
        if (this.isActive()) {
            return _build.call(this);
        }
        else return this._final;
    };

    /**
     * Get the destination state of the Transform
     *
     * @method getFinal
     *
     * @return Transform {Transform}
     */
    TransitionableTransform.prototype.getFinal = function getFinal() {
        return this._final;
    };

    /**
     * Determine if the TransitionalTransform is currently transitioning
     *
     * @method isActive
     *
     * @return {Boolean}
     */
    TransitionableTransform.prototype.isActive = function isActive() {
        return this.translate.isActive() || this.rotate.isActive() || this.scale.isActive() || this.skew.isActive();
    };

    /**
     * Halts the transition
     *
     * @method halt
     */
    TransitionableTransform.prototype.halt = function halt() {
        this._final = this.get();
        this.translate.halt();
        this.rotate.halt();
        this.skew.halt();
        this.scale.halt();
    };

    module.exports = TransitionableTransform;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Modifier',['require','exports','module','./Transform','famous/transitions/Transitionable','famous/transitions/TransitionableTransform'],function(require, exports, module) {
    var Transform = require('./Transform');

    /* TODO: remove these dependencies when deprecation complete */
    var Transitionable = require('famous/transitions/Transitionable');
    var TransitionableTransform = require('famous/transitions/TransitionableTransform');

    /**
     *
     *  A collection of visual changes to be
     *    applied to another renderable component. This collection includes a
     *    transform matrix, an opacity constant, a size, an origin specifier.
     *    Modifier objects can be added to any RenderNode or object
     *    capable of displaying renderables.  The Modifier's children and descendants
     *    are transformed by the amounts specified in the Modifier's properties.
     *
     * @class Modifier
     * @constructor
     * @param {Object} [options] overrides of default options
     * @param {Transform} [options.transform] affine transformation matrix
     * @param {Number} [options.opacity]
     * @param {Array.Number} [options.origin] origin adjustment
     * @param {Array.Number} [options.size] size to apply to descendants
     */
    function Modifier(options) {
        this._transformGetter = null;
        this._opacityGetter = null;
        this._originGetter = null;
        this._sizeGetter = null;

        /* TODO: remove this when deprecation complete */
        this._legacyStates = {};

        this._output = {
            transform: Transform.identity,
            opacity: 1,
            origin: null,
            size: null,
            target: null
        };

        if (options) {
            if (options.transform) this.transformFrom(options.transform);
            if (options.opacity !== undefined) this.opacityFrom(options.opacity);
            if (options.origin) this.originFrom(options.origin);
            if (options.size) this.sizeFrom(options.size);
        }
    }

    /**
     * Function, object, or static transform matrix which provides the transform.
     *   This is evaluated on every tick of the engine.
     *
     * @method transformFrom
     *
     * @param {Object} transform transform provider object
     * @return {Modifier} this
     */
    Modifier.prototype.transformFrom = function transformFrom(transform) {
        if (transform instanceof Function) this._transformGetter = transform;
        else if (transform instanceof Object && transform.get) this._transformGetter = transform.get.bind(transform);
        else {
            this._transformGetter = null;
            this._output.transform = transform;
        }
        return this;
    };

    /**
     * Set function, object, or number to provide opacity, in range [0,1].
     *
     * @method opacityFrom
     *
     * @param {Object} opacity provider object
     * @return {Modifier} this
     */
    Modifier.prototype.opacityFrom = function opacityFrom(opacity) {
        if (opacity instanceof Function) this._opacityGetter = opacity;
        else if (opacity instanceof Object && opacity.get) this._opacityGetter = opacity.get.bind(opacity);
        else {
            this._opacityGetter = null;
            this._output.opacity = opacity;
        }
        return this;
    };

    /**
     * Set function, object, or numerical array to provide origin, as [x,y],
     *   where x and y are in the range [0,1].
     *
     * @method originFrom
     *
     * @param {Object} origin provider object
     * @return {Modifier} this
     */

    Modifier.prototype.originFrom = function originFrom(origin) {
        if (origin instanceof Function) this._originGetter = origin;
        else if (origin instanceof Object && origin.get) this._originGetter = origin.get.bind(origin);
        else {
            this._originGetter = null;
            this._output.origin = origin;
        }
        return this;
    };

    /**
     * Set function, object, or numerical array to provide size, as [width, height].
     *
     * @method sizeFrom
     *
     * @param {Object} size provider object
     * @return {Modifier} this
     */
    Modifier.prototype.sizeFrom = function sizeFrom(size) {
        if (size instanceof Function) this._sizeGetter = size;
        else if (size instanceof Object && size.get) this._sizeGetter = size.get.bind(size);
        else {
            this._sizeGetter = null;
            this._output.size = size;
        }
        return this;
    };

     /**
     * Deprecated: Prefer transformFrom with static Transform, or use a TransitionableTransform.
     * @deprecated
     * @method setTransform
     *
     * @param {Transform} transform Transform to transition to
     * @param {Transitionable} transition Valid transitionable object
     * @param {Function} callback callback to call after transition completes
     * @return {Modifier} this
     */
    Modifier.prototype.setTransform = function setTransform(transform, transition, callback) {
        if (transition || this._legacyStates.transform) {
            if (!this._legacyStates.transform) {
                this._legacyStates.transform = new TransitionableTransform(this._output.transform);
            }
            if (!this._transformGetter) this.transformFrom(this._legacyStates.transform);

            this._legacyStates.transform.set(transform, transition, callback);
            return this;
        }
        else return this.transformFrom(transform);
    };

    /**
     * Deprecated: Prefer opacityFrom with static opacity array, or use a Transitionable with that opacity.
     * @deprecated
     * @method setOpacity
     *
     * @param {Number} opacity Opacity value to transition to.
     * @param {Transitionable} transition Valid transitionable object
     * @param {Function} callback callback to call after transition completes
     * @return {Modifier} this
     */
    Modifier.prototype.setOpacity = function setOpacity(opacity, transition, callback) {
        if (transition || this._legacyStates.opacity) {
            if (!this._legacyStates.opacity) {
                this._legacyStates.opacity = new Transitionable(this._output.opacity);
            }
            if (!this._opacityGetter) this.opacityFrom(this._legacyStates.opacity);

            return this._legacyStates.opacity.set(opacity, transition, callback);
        }
        else return this.opacityFrom(opacity);
    };

    /**
     * Deprecated: Prefer originFrom with static origin array, or use a Transitionable with that origin.
     * @deprecated
     * @method setOrigin
     *
     * @param {Array.Number} origin two element array with values between 0 and 1.
     * @param {Transitionable} transition Valid transitionable object
     * @param {Function} callback callback to call after transition completes
     * @return {Modifier} this
     */
    Modifier.prototype.setOrigin = function setOrigin(origin, transition, callback) {
        /* TODO: remove this if statement when deprecation complete */
        if (transition || this._legacyStates.origin) {

            if (!this._legacyStates.origin) {
                this._legacyStates.origin = new Transitionable(this._output.origin || [0, 0]);
            }
            if (!this._originGetter) this.originFrom(this._legacyStates.origin);

            this._legacyStates.origin.set(origin, transition, callback);
            return this;
        }
        else return this.originFrom(origin);
    };

    /**
     * Deprecated: Prefer sizeFrom with static origin array, or use a Transitionable with that size.
     * @deprecated
     * @method setSize
     * @param {Array.Number} size two element array of [width, height]
     * @param {Transitionable} transition Valid transitionable object
     * @param {Function} callback callback to call after transition completes
     * @return {Modifier} this
     */
    Modifier.prototype.setSize = function setSize(size, transition, callback) {
        if (size && (transition || this._legacyStates.size)) {
            if (!this._legacyStates.size) {
                this._legacyStates.size = new Transitionable(this._output.size || [0, 0]);
            }
            if (!this._sizeGetter) this.sizeFrom(this._legacyStates.size);

            this._legacyStates.size.set(size, transition, callback);
            return this;
        }
        else return this.sizeFrom(size);
    };

    /**
     * Deprecated: Prefer to stop transform in your provider object.
     * @deprecated
     * @method halt
     */
    Modifier.prototype.halt = function halt() {
        if (this._legacyStates.transform) this._legacyStates.transform.halt();
        if (this._legacyStates.opacity) this._legacyStates.opacity.halt();
        if (this._legacyStates.origin) this._legacyStates.origin.halt();
        if (this._legacyStates.size) this._legacyStates.size.halt();
        this._transformGetter = null;
        this._opacityGetter = null;
        this._originGetter = null;
        this._sizeGetter = null;
    };

    /**
     * Deprecated: Prefer to use your provided transform or output of your transform provider.
     * @deprecated
     * @method getTransform
     * @return {Object} transform provider object
     */
    Modifier.prototype.getTransform = function getTransform() {
        return this._transformGetter();
    };

    /**
     * Deprecated: Prefer to determine the end state of your transform from your transform provider
     * @deprecated
     * @method getFinalTransform
     * @return {Transform} transform matrix
     */
    Modifier.prototype.getFinalTransform = function getFinalTransform() {
        return this._legacyStates.transform ? this._legacyStates.transform.getFinal() : this._output.transform;
    };

    /**
     * Deprecated: Prefer to use your provided opacity or output of your opacity provider.
     * @deprecated
     * @method getOpacity
     * @return {Object} opacity provider object
     */
    Modifier.prototype.getOpacity = function getOpacity() {
        return this._opacityGetter();
    };
    /**
     * Deprecated: Prefer to use your provided origin or output of your origin provider.
     * @deprecated
     * @method getOrigin
     * @return {Object} origin provider object
     */
    Modifier.prototype.getOrigin = function getOrigin() {
        return this._originGetter();
    };

    /**
     * Deprecated: Prefer to use your provided size or output of your size provider.
     * @deprecated
     * @method getSize
     * @return {Object} size provider object
     */
    Modifier.prototype.getSize = function getSize() {
        return this._sizeGetter ? this._sizeGetter() : this._output.size;
    };

    // call providers on tick to receive render spec elements to apply
    function _update() {
        if (this._transformGetter) this._output.transform = this._transformGetter();
        if (this._opacityGetter) this._output.opacity = this._opacityGetter();
        if (this._originGetter) this._output.origin = this._originGetter();
        if (this._sizeGetter) this._output.size = this._sizeGetter();
    }

    /**
     * Return render spec for this Modifier, applying to the provided
     *    target component.  This is similar to render() for Surfaces.
     *
     * @private
     * @method modify
     *
     * @param {Object} target (already rendered) render spec to
     *    which to apply the transform.
     * @return {Object} render spec for this Modifier, including the
     *    provided target
     */
    Modifier.prototype.modify = function modify(target) {
        _update.call(this);
        this._output.target = target;
        return this._output;
    };

    module.exports = Modifier;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: felix@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/views/HeaderFooterLayout',['require','exports','module','famous/core/Entity','famous/core/RenderNode','famous/core/Transform','famous/core/OptionsManager'],function(require, exports, module) {
    var Entity = require('famous/core/Entity');
    var RenderNode = require('famous/core/RenderNode');
    var Transform = require('famous/core/Transform');
    var OptionsManager = require('famous/core/OptionsManager');

    /**
     * A layout which will arrange three renderables into a header and footer area of defined size,
      and a content area of flexible size.
     * @class HeaderFooterLayout
     * @constructor
     * @param {Options} [options] An object of configurable options.
     * @param {Number} [options.direction=HeaderFooterLayout.DIRECTION_Y] A direction of HeaderFooterLayout.DIRECTION_X
     * lays your HeaderFooterLayout instance horizontally, and a direction of HeaderFooterLayout.DIRECTION_Y
     * lays it out vertically.
     * @param {Number} [options.headerSize=undefined]  The amount of pixels allocated to the header node
     * in the HeaderFooterLayout instance's direction.
     * @param {Number} [options.footerSize=undefined] The amount of pixels allocated to the footer node
     * in the HeaderFooterLayout instance's direction.
     */
    function HeaderFooterLayout(options) {
        this.options = Object.create(HeaderFooterLayout.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);
        if (options) this.setOptions(options);

        this._entityId = Entity.register(this);

        this.header = new RenderNode();
        this.footer = new RenderNode();
        this.content = new RenderNode();
    }

    /**
     *  When used as a value for your HeaderFooterLayout's direction option, causes it to lay out horizontally.
     *
     *  @attribute DIRECTION_X
     *  @type Number
     *  @static
     *  @default 0
     *  @protected
     */
    HeaderFooterLayout.DIRECTION_X = 0;

    /**
     *  When used as a value for your HeaderFooterLayout's direction option, causes it to lay out vertically.
     *
     *  @attribute DIRECTION_Y
     *  @type Number
     *  @static
     *  @default 1
     *  @protected
     */
    HeaderFooterLayout.DIRECTION_Y = 1;

    HeaderFooterLayout.DEFAULT_OPTIONS = {
        direction: HeaderFooterLayout.DIRECTION_Y,
        headerSize: undefined,
        footerSize: undefined,
        defaultHeaderSize: 0,
        defaultFooterSize: 0
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {Object} Render spec for this component
     */
    HeaderFooterLayout.prototype.render = function render() {
        return this._entityId;
    };

    /**
     * Patches the HeaderFooterLayout instance's options with the passed-in ones.
     *
     * @method setOptions
     * @param {Options} options An object of configurable options for the HeaderFooterLayout instance.
     */
    HeaderFooterLayout.prototype.setOptions = function setOptions(options) {
        return this._optionsManager.setOptions(options);
    };

    function _resolveNodeSize(node, defaultSize) {
        var nodeSize = node.getSize();
        return nodeSize ? nodeSize[this.options.direction] : defaultSize;
    }

    function _outputTransform(offset) {
        if (this.options.direction == HeaderFooterLayout.DIRECTION_X) return Transform.translate(offset, 0, 0);
        else return Transform.translate(0, offset, 0);
    }

    function _finalSize(directionSize, size) {
        if (this.options.direction == HeaderFooterLayout.DIRECTION_X) return [directionSize, size[1]];
        else return [size[0], directionSize];
    }

    /**
     * Apply changes from this component to the corresponding document element.
     * This includes changes to classes, styles, size, content, opacity, origin,
     * and matrix transforms.
     *
     * @private
     * @method commit
     * @param {Context} context commit context
     */
    HeaderFooterLayout.prototype.commit = function commit(context) {
        var transform = context.transform;
        var origin = context.origin;
        var size = context.size;
        var opacity = context.opacity;

        var headerSize = (this.options.headerSize !== undefined) ? this.options.headerSize : _resolveNodeSize.call(this, this.header, this.options.defaultHeaderSize);
        var footerSize = (this.options.footerSize !== undefined) ? this.options.footerSize : _resolveNodeSize.call(this, this.footer, this.options.defaultFooterSize);
        var contentSize = size[this.options.direction] - headerSize - footerSize;

        if (size) transform = Transform.moveThen([-size[0]*origin[0], -size[1]*origin[1], 0], transform);

        var result = [
            {
                size: _finalSize.call(this, headerSize, size),
                target: this.header.render()
            },
            {
                transform: _outputTransform.call(this, headerSize),
                size: _finalSize.call(this, contentSize, size),
                target: this.content.render()
            },
            {
                transform: _outputTransform.call(this, headerSize + contentSize),
                size: _finalSize.call(this, footerSize, size),
                target: this.footer.render()
            }
        ];

        var nextSpec = {
            transform: transform,
            opacity: opacity,
            size: size,
            target: result
        };
        return nextSpec;
    };

    module.exports = HeaderFooterLayout;
});


/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/surfaces/ContainerSurface',['require','exports','module','famous/core/Surface','famous/core/Context'],function(require, exports, module) {
    var Surface = require('famous/core/Surface');
    var Context = require('famous/core/Context');

    /**
     * ContainerSurface is an object designed to contain surfaces and
     *   set properties to be applied to all of them at once.
     *   This extends the Surface class.
     *   A container surface will enforce these properties on the
     *   surfaces it contains:
     *
     *   size (clips contained surfaces to its own width and height);
     *
     *   origin;
     *
     *   its own opacity and transform, which will be automatically
     *   applied to  all Surfaces contained directly and indirectly.
     *
     * @class ContainerSurface
     * @extends Surface
     * @constructor
     * @param {Array.Number} [options.size] [width, height] in pixels
     * @param {Array.string} [options.classes] CSS classes to set on all inner content
     * @param {Array} [options.properties] string dictionary of HTML attributes to set on target div
     * @param {string} [options.content] inner (HTML) content of surface (should not be used)
     */
    function ContainerSurface(options) {
        Surface.call(this, options);
        this._container = document.createElement('div');
        this._container.classList.add('famous-group');
        this._container.classList.add('famous-container-group');
        this._shouldRecalculateSize = false;
        this.context = new Context(this._container);
        this.setContent(this._container);
    }

    ContainerSurface.prototype = Object.create(Surface.prototype);
    ContainerSurface.prototype.constructor = ContainerSurface;
    ContainerSurface.prototype.elementType = 'div';
    ContainerSurface.prototype.elementClass = 'famous-surface';

    /**
     * Add renderables to this object's render tree
     *
     * @method add
     *
     * @param {Object} obj renderable object
     * @return {RenderNode} RenderNode wrapping this object, if not already a RenderNode
     */
    ContainerSurface.prototype.add = function add() {
        return this.context.add.apply(this.context, arguments);
    };

    /**
     * Return spec for this surface.  Note: Can result in a size recalculation.
     *
     * @private
     * @method render
     *
     * @return {Object} render spec for this surface (spec id)
     */
    ContainerSurface.prototype.render = function render() {
        if (this._sizeDirty) this._shouldRecalculateSize = true;
        return Surface.prototype.render.apply(this, arguments);
    };

    /**
     * Place the document element this component manages into the document.
     *
     * @private
     * @method deploy
     * @param {Node} target document parent of this container
     */
    ContainerSurface.prototype.deploy = function deploy() {
        this._shouldRecalculateSize = true;
        return Surface.prototype.deploy.apply(this, arguments);
    };

    /**
     * Apply changes from this component to the corresponding document element.
     * This includes changes to classes, styles, size, content, opacity, origin,
     * and matrix transforms.
     *
     * @private
     * @method commit
     * @param {Context} context commit context
     * @param {Transform} transform unused TODO
     * @param {Number} opacity  unused TODO
     * @param {Array.Number} origin unused TODO
     * @param {Array.Number} size unused TODO
     * @return {undefined} TODO returns an undefined value
     */
    ContainerSurface.prototype.commit = function commit(context, transform, opacity, origin, size) {
        var previousSize = this._size ? [this._size[0], this._size[1]] : null;
        var result = Surface.prototype.commit.apply(this, arguments);
        if (this._shouldRecalculateSize || (previousSize && (this._size[0] !== previousSize[0] || this._size[1] !== previousSize[1]))) {
            this.context.setSize();
            this._shouldRecalculateSize = false;
        }
        this.context.update();
        return result;
    };

    module.exports = ContainerSurface;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Scene',['require','exports','module','./Transform','./Modifier','./RenderNode'],function(require, exports, module) {
    var Transform = require('./Transform');
    var Modifier = require('./Modifier');
    var RenderNode = require('./RenderNode');

    /**
     * Builds and renders a scene graph based on a declarative structure definition.
     * See the Scene examples in the examples distribution (http://github.com/Famous/examples.git).
     *
     * @class Scene
     * @constructor
     * @param {Object} definition in the format of a render spec.
     */
    function Scene(definition) {
        this.id = null;
        this._objects = null;

        this.node = new RenderNode();
        this._definition = null;

        if (definition) this.load(definition);
    }

    var _MATRIX_GENERATORS = {
        'translate': Transform.translate,
        'rotate': Transform.rotate,
        'rotateX': Transform.rotateX,
        'rotateY': Transform.rotateY,
        'rotateZ': Transform.rotateZ,
        'rotateAxis': Transform.rotateAxis,
        'scale': Transform.scale,
        'skew': Transform.skew,
        'matrix3d': function() {
            return arguments;
        }
    };

    /**
     * Clone this scene
     *
     * @method create
     * @return {Scene} deep copy of this scene
     */
    Scene.prototype.create = function create() {
        return new Scene(this._definition);
    };

    function _resolveTransformMatrix(matrixDefinition) {
        for (var type in _MATRIX_GENERATORS) {
            if (type in matrixDefinition) {
                var args = matrixDefinition[type];
                if (!(args instanceof Array)) args = [args];
                return _MATRIX_GENERATORS[type].apply(this, args);
            }
        }
    }

    // parse transform into tree of render nodes, doing matrix multiplication
    // when available
    function _parseTransform(definition) {
        var transformDefinition = definition.transform;
        var opacity = definition.opacity;
        var origin = definition.origin;
        var size = definition.size;
        var transform = Transform.identity;
        if (transformDefinition instanceof Array) {
            if (transformDefinition.length === 16 && typeof transformDefinition[0] === 'number') {
                transform = transformDefinition;
            }
            else {
                for (var i = 0; i < transformDefinition.length; i++) {
                    transform = Transform.multiply(transform, _resolveTransformMatrix(transformDefinition[i]));
                }
            }
        }
        else if (transformDefinition instanceof Object) {
            transform = _resolveTransformMatrix(transformDefinition);
        }

        var result = new Modifier({
            transform: transform,
            opacity: opacity,
            origin: origin,
            size: size
        });
        return result;
    }

    function _parseArray(definition) {
        var result = new RenderNode();
        for (var i = 0; i < definition.length; i++) {
            var obj = _parse.call(this, definition[i]);
            if (obj) result.add(obj);
        }
        return result;
    }

    // parse object directly into tree of RenderNodes
    function _parse(definition) {
        var result;
        var id;
        if (definition instanceof Array) {
            result = _parseArray.call(this, definition);
        }
        else {
            id = this._objects.length;
            if (definition.render && (definition.render instanceof Function)) {
                result = definition;
            }
            else if (definition.target) {
                var targetObj = _parse.call(this, definition.target);
                var obj = _parseTransform.call(this, definition);

                result = new RenderNode(obj);
                result.add(targetObj);
                if (definition.id) this.id[definition.id] = obj;
            }
            else if (definition.id) {
                result = new RenderNode();
                this.id[definition.id] = result;
            }
        }
        this._objects[id] = result;
        return result;
    }

    /**
     * Builds and renders a scene graph based on a canonical declarative scene definition.
     * See examples/Scene/example.js.
     *
     * @method load
     * @param {Object} definition definition in the format of a render spec.
     */
    Scene.prototype.load = function load(definition) {
        this._definition = definition;
        this.id = {};
        this._objects = [];
        this.node.set(_parse.call(this, definition));
    };

    /**
     * Add renderables to this component's render tree
     *
     * @method add
     *
     * @param {Object} obj renderable object
     * @return {RenderNode} Render wrapping provided object, if not already a RenderNode
     */
    Scene.prototype.add = function add() {
        return this.node.add.apply(this.node, arguments);
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    Scene.prototype.render = function render() {
        return this.node.render.apply(this.node, arguments);
    };

    module.exports = Scene;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/View',['require','exports','module','./EventHandler','./OptionsManager','./RenderNode'],function(require, exports, module) {
    var EventHandler = require('./EventHandler');
    var OptionsManager = require('./OptionsManager');
    var RenderNode = require('./RenderNode');

    /**
     * Useful for quickly creating elements within applications
     *   with large event systems.  Consists of a RenderNode paired with
     *   an input EventHandler and an output EventHandler.
     *   Meant to be extended by the developer.
     *
     * @class View
     * @uses EventHandler
     * @uses OptionsManager
     * @uses RenderNode
     * @constructor
     */
    function View(options) {
        this._node = new RenderNode();

        this._eventInput = new EventHandler();
        this._eventOutput = new EventHandler();
        EventHandler.setInputHandler(this, this._eventInput);
        EventHandler.setOutputHandler(this, this._eventOutput);

        this.options = Object.create(this.constructor.DEFAULT_OPTIONS || View.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);

        if (options) this.setOptions(options);
    }

    View.DEFAULT_OPTIONS = {}; // no defaults

    /**
     * Look up options value by key
     * @method getOptions
     *
     * @param {string} key key
     * @return {Object} associated object
     */
    View.prototype.getOptions = function getOptions() {
        return this._optionsManager.value();
    };

    /*
     *  Set internal options.
     *  No defaults options are set in View.
     *
     *  @method setOptions
     *  @param {Object} options
     */
    View.prototype.setOptions = function setOptions(options) {
        this._optionsManager.patch(options);
    };

    /**
     * Add a child renderable to the view.
     *   Note: This is meant to be used by an inheriting class
     *   rather than from outside the prototype chain.
     *
     * @method add
     * @return {RenderNode}
     * @protected
     */
    View.prototype.add = function add() {
        return this._node.add.apply(this._node, arguments);
    };

    /**
     * Alias for add
     * @method _add
     */
    View.prototype._add = View.prototype.add;

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    View.prototype.render = function render() {
        return this._node.render();
    };

    /**
     * Return size of contained element.
     *
     * @method getSize
     * @return {Array.Number} [width, height]
     */
    View.prototype.getSize = function getSize() {
        if (this._node && this._node.getSize) {
            return this._node.getSize.apply(this._node, arguments) || this.options.size;
        }
        else return this.options.size;
    };

    module.exports = View;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('widgets/common/NavigationBar',['require','exports','module','famous/core/Scene','famous/core/Surface','famous/core/Transform','famous/core/View'],function(require, exports, module) {
    var Scene = require('famous/core/Scene');
    var Surface = require('famous/core/Surface');
    var Transform = require('famous/core/Transform');
    var View = require('famous/core/View');

    /**
     * A view for display for displaying the title of the current page
     *  as well as icons for navigating backwards and opening
     *  further options
     *
     * @class NavigationBar
     * @extends View
     * @constructor
     *
     * @param {object} [options] overrides of deault options
     * @param {Array.number} [options.size=(undefined,0.5)] Size of the navigation bar and it's componenets.
     * @param {Array.string} [options.backClasses=(back)] CSS Classes attached to back of Navigation.
     * @param {String} [options.backContent=(&#x25c0;)] Content of the back button.
     * @param {Array.string} [options.classes=(navigation)] CSS Classes attached to the surfaces.
     * @param {String} [options.content] Content to pass into title bar.
     * @param {Array.string} [options.classes=(more)] CSS Classes attached to the More surface.
     * @param {String} [options.moreContent=(&#x271a;)] Content of the more button.
     */
    function NavigationBar(options) {
        View.apply(this, arguments);

        this.title = new Surface({
            classes: this.options.classes,
            content: this.options.content
        });

        this.back = new Surface({
            size: [this.options.size[1], this.options.size[1]],
            classes: this.options.classes,
            content: this.options.backContent
        });
        this.back.on('click', function() {
            this._eventOutput.emit('back', {});
        }.bind(this));

        this.more = new Surface({
            size: [this.options.size[1], this.options.size[1]],
            classes: this.options.classes,
            content: this.options.moreContent
        });
        this.more.on('click', function() {
            this._eventOutput.emit('more', {});
        }.bind(this));

        this.layout = new Scene({
            id: 'master',
            size: this.options.size,
            target: [
                {
                    transform: Transform.inFront,
                    origin: [0, 0.5],
                    target: this.back
                },
                {
                    origin: [0.5, 0.5],
                    target: this.title
                },
                {
                    transform: Transform.inFront,
                    origin: [1, 0.5],
                    target: this.more
                }
            ]
        });

        this._add(this.layout);

        this._optionsManager.on('change', function(event) {
            var key = event.id;
            var data = event.value;
            if (key === 'size') {
                this.layout.id.master.setSize(data);
                this.title.setSize(data);
                this.back.setSize([data[1], data[1]]);
                this.more.setSize([data[1], data[1]]);
            }
            else if (key === 'backClasses') {
                this.back.setOptions({classes: this.options.classes.concat(this.options.backClasses)});
            }
            else if (key === 'backContent') {
                this.back.setContent(this.options.backContent);
            }
            else if (key === 'classes') {
                this.title.setOptions({classes: this.options.classes});
                this.back.setOptions({classes: this.options.classes.concat(this.options.backClasses)});
                this.more.setOptions({classes: this.options.classes.concat(this.options.moreClasses)});
            }
            else if (key === 'content') {
                this.setContent(this.options.content);
            }
            else if (key === 'moreClasses') {
                this.more.setOptions({classes: this.options.classes.concat(this.options.moreClasses)});
            }
            else if (key === 'moreContent') {
                this.more.setContent(this.options.content);
            }
        }.bind(this));
    }

    NavigationBar.prototype = Object.create(View.prototype);
    NavigationBar.prototype.constructor = NavigationBar;

    NavigationBar.DEFAULT_OPTIONS = {
        size: [undefined, 50],
        backClasses: ['back'],
        backContent: '&#x25c0;',
        classes: ['navigation'],
        content: '',
        moreClasses: ['more'],
        moreContent: '&#x271a;'
    };

    /**
     * Set the title of the NavigationBar
     *
     * @method setContent
     *
     * @param {object} content JSON object containing title information
     *
     * @return {undefined}
     */
    NavigationBar.prototype.setContent = function setContent(content) {
        return this.title.setContent(content);
    };

    NavigationBar.prototype.setBackButtonEnabled = function(isEnabled) {
        if (isEnabled){
            this.back.removeClass('disabled');
        } else {
            this.back.addClass('disabled');
        }
    };

    NavigationBar.prototype.setMoreButtonEnabled = function(isEnabled) {
        if (isEnabled){
            this.more.removeClass('disabled');
        } else {
            this.more.addClass('disabled');
        }
    };

    module.exports = NavigationBar;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: felix@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/views/RenderController',['require','exports','module','famous/core/Modifier','famous/core/RenderNode','famous/core/Transform','famous/transitions/Transitionable','famous/core/View'],function(require, exports, module) {
    var Modifier = require('famous/core/Modifier');
    var RenderNode = require('famous/core/RenderNode');
    var Transform = require('famous/core/Transform');
    var Transitionable = require('famous/transitions/Transitionable');
    var View = require('famous/core/View');

    /**
     * A dynamic view that can show or hide different renerables with transitions.
     * @class RenderController
     * @constructor
     * @param {Options} [options] An object of configurable options.
     * @param {Transition} [inTransition=true] The transition in charge of showing a renderable.
     * @param {Transition} [outTransition=true]  The transition in charge of removing your previous renderable when
     * you show a new one, or hiding your current renderable.
     * @param {Boolean} [overlap=true] When showing a new renderable, overlap determines if the
      out transition of the old one executes concurrently with the in transition of the new one,
       or synchronously beforehand.
     */
    function RenderController(options) {
        View.apply(this, arguments);

        this._showing = -1;
        this._outgoingRenderables = [];
        this._nextRenderable = null;

        this._renderables = [];
        this._nodes = [];
        this._modifiers = [];
        this._states = [];

        this.inTransformMap = RenderController.DefaultMap.transform;
        this.inOpacityMap = RenderController.DefaultMap.opacity;
        this.inOriginMap = RenderController.DefaultMap.origin;
        this.outTransformMap = RenderController.DefaultMap.transform;
        this.outOpacityMap = RenderController.DefaultMap.opacity;
        this.outOriginMap = RenderController.DefaultMap.origin;

        this._output = [];
    }
    RenderController.prototype = Object.create(View.prototype);
    RenderController.prototype.constructor = RenderController;

    RenderController.DEFAULT_OPTIONS = {
        inTransition: true,
        outTransition: true,
        overlap: true
    };

    RenderController.DefaultMap = {
        transform: function() {
            return Transform.identity;
        },
        opacity: function(progress) {
            return progress;
        },
        origin: null
    };

    function _mappedState(map, state) {
        return map(state.get());
    }

    /**
     * As your RenderController shows a new renderable, it executes a transition in. This transition in
     * will affect a default interior state and modify it as you bring renderables in and out. However, if you want to control
     * the transform, opacity, and origin state yourself, you may call certain methods (such as inTransformFrom) to obtain state from an outside source,
     * that may either be a function or a Famous transitionable. inTransformFrom sets the accessor for the state of
     * the transform used in transitioning in renderables.
     *
     * @method inTransformFrom
     * @param {Function|Transitionable} transform  A function that returns a transform from outside closure, or a
     * a transitionable that manages a full transform (a sixteen value array).
     * @chainable
     */
    RenderController.prototype.inTransformFrom = function inTransformFrom(transform) {
        if (transform instanceof Function) this.inTransformMap = transform;
        else if (transform && transform.get) this.inTransformMap = transform.get.bind(transform);
        else throw new Error('inTransformFrom takes only function or getter object');
        //TODO: tween transition
        return this;
    };

    /**
     * inOpacityFrom sets the accessor for the state of the opacity used in transitioning in renderables.
     * @method inOpacityFrom
     * @param {Function|Transitionable} opacity  A function that returns an opacity from outside closure, or a
     * a transitionable that manages opacity (a number between zero and one).
     * @chainable
     */
    RenderController.prototype.inOpacityFrom = function inOpacityFrom(opacity) {
        if (opacity instanceof Function) this.inOpacityMap = opacity;
        else if (opacity && opacity.get) this.inOpacityMap = opacity.get.bind(opacity);
        else throw new Error('inOpacityFrom takes only function or getter object');
        //TODO: tween opacity
        return this;
    };

    /**
     * inOriginFrom sets the accessor for the state of the origin used in transitioning in renderables.
     * @method inOriginFrom
     * @param {Function|Transitionable} origin A function that returns an origin from outside closure, or a
     * a transitionable that manages origin (a two value array of numbers between zero and one).
     * @chainable
     */
    RenderController.prototype.inOriginFrom = function inOriginFrom(origin) {
        if (origin instanceof Function) this.inOriginMap = origin;
        else if (origin && origin.get) this.inOriginMap = origin.get.bind(origin);
        else throw new Error('inOriginFrom takes only function or getter object');
        //TODO: tween origin
        return this;
    };

    /**
     * outTransformFrom sets the accessor for the state of the transform used in transitioning out renderables.
     * @method show
     * @param {Function|Transitionable} transform  A function that returns a transform from outside closure, or a
     * a transitionable that manages a full transform (a sixteen value array).
     * @chainable
     */
    RenderController.prototype.outTransformFrom = function outTransformFrom(transform) {
        if (transform instanceof Function) this.outTransformMap = transform;
        else if (transform && transform.get) this.outTransformMap = transform.get.bind(transform);
        else throw new Error('inTransformFrom takes only function or getter object');
        //TODO: tween transition
        return this;
    };

    /**
     * outOpacityFrom sets the accessor for the state of the opacity used in transitioning out renderables.
     * @method inOpacityFrom
     * @param {Function|Transitionable} opacity  A function that returns an opacity from outside closure, or a
     * a transitionable that manages opacity (a number between zero and one).
     * @chainable
     */
    RenderController.prototype.outOpacityFrom = function outOpacityFrom(opacity) {
        if (opacity instanceof Function) this.outOpacityMap = opacity;
        else if (opacity && opacity.get) this.outOpacityMap = opacity.get.bind(opacity);
        else throw new Error('inOpacityFrom takes only function or getter object');
        //TODO: tween opacity
        return this;
    };

    /**
     * outOriginFrom sets the accessor for the state of the origin used in transitioning out renderables.
     * @method inOriginFrom
     * @param {Function|Transitionable} origin A function that returns an origin from outside closure, or a
     * a transitionable that manages origin (a two value array of numbers between zero and one).
     * @chainable
     */
    RenderController.prototype.outOriginFrom = function outOriginFrom(origin) {
        if (origin instanceof Function) this.outOriginMap = origin;
        else if (origin && origin.get) this.outOriginMap = origin.get.bind(origin);
        else throw new Error('inOriginFrom takes only function or getter object');
        //TODO: tween origin
        return this;
    };

    /**
     * Show displays the targeted renderable with a transition and an optional callback to
     * execute afterwards.
     * @method show
     * @param {Object} renderable The renderable you want to show.
     * @param {Transition} [transition] Overwrites the default transition in to display the
     * passed-in renderable.
     * @param {function} [callback] Executes after transitioning in the renderable.
     * @chainable
     */
    RenderController.prototype.show = function show(renderable, transition, callback) {
        if (!renderable) {
            return this.hide(callback);
        }

        if (transition instanceof Function) {
            callback = transition;
            transition = null;
        }

        if (this._showing >= 0) {
            if (this.options.overlap) this.hide(callback);
            else {
                if (this._nextRenderable) {
                    this._nextRenderable = renderable;
                }
                else {
                    this._nextRenderable = renderable;
                    this.hide(function() {
                        if (this._nextRenderable === renderable) this.show(this._nextRenderable, callback);
                        this._nextRenderable = null;
                    });
                }
                return;
            }
        }

        var state = null;

        // check to see if we should restore
        var renderableIndex = this._renderables.indexOf(renderable);
        if (renderableIndex >= 0) {
            this._showing = renderableIndex;
            state = this._states[renderableIndex];
            state.halt();

            var outgoingIndex = this._outgoingRenderables.indexOf(renderable);
            if (outgoingIndex >= 0) this._outgoingRenderables.splice(outgoingIndex, 1);
        }
        else {
            state = new Transitionable(0);

            var modifier = new Modifier({
                transform: this.inTransformMap ? _mappedState.bind(this, this.inTransformMap, state) : null,
                opacity: this.inOpacityMap ? _mappedState.bind(this, this.inOpacityMap, state) : null,
                origin: this.inOriginMap ? _mappedState.bind(this, this.inOriginMap, state) : null
            });
            var node = new RenderNode();
            node.add(modifier).add(renderable);

            this._showing = this._nodes.length;
            this._nodes.push(node);
            this._modifiers.push(modifier);
            this._states.push(state);
            this._renderables.push(renderable);
        }

        if (!transition) transition = this.options.inTransition;
        state.set(1, transition, callback);
    };

    /**
     * Hide hides the currently displayed renderable with an out transition.
     * @method hide
     * @param {Transition} [transition] Overwrites the default transition in to hide the
     * currently controlled renderable.
     * @param {function} [callback] Executes after transitioning out the renderable.
     * @chainable
     */
    RenderController.prototype.hide = function hide(transition, callback) {
        if (this._showing < 0) return;
        var index = this._showing;
        this._showing = -1;

        if (transition instanceof Function) {
            callback = transition;
            transition = undefined;
        }

        var node = this._nodes[index];
        var modifier = this._modifiers[index];
        var state = this._states[index];
        var renderable = this._renderables[index];

        modifier.transformFrom(this.outTransformMap ? _mappedState.bind(this, this.outTransformMap, state) : null);
        modifier.opacityFrom(this.outOpacityMap ? _mappedState.bind(this, this.outOpacityMap, state) : null);
        modifier.originFrom(this.outOriginMap ? _mappedState.bind(this, this.outOriginMap, state) : null);

        if (this._outgoingRenderables.indexOf(renderable) < 0) this._outgoingRenderables.push(renderable);

        if (!transition) transition = this.options.outTransition;
        state.halt();
        state.set(0, transition, function(node, modifier, state, renderable) {
            if (this._outgoingRenderables.indexOf(renderable) >= 0) {
                var index = this._nodes.indexOf(node);
                this._nodes.splice(index, 1);
                this._modifiers.splice(index, 1);
                this._states.splice(index, 1);
                this._renderables.splice(index, 1);
                this._outgoingRenderables.splice(this._outgoingRenderables.indexOf(renderable), 1);

                if (this._showing >= index) this._showing--;
            }
            if (callback) callback.call(this);
        }.bind(this, node, modifier, state, renderable));
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    RenderController.prototype.render = function render() {
        var result = this._output;
        if (result.length > this._nodes.length) result.splice(this._nodes.length);
        for (var i = 0; i < this._nodes.length; i++) {
            result[i] = this._nodes[i].render();
        }
        return result;
    };

    module.exports = RenderController;
});

/**
 * Created by LOGICIFY\corvis on 4/12/14.
 */
define('activity/common/ActivityHolder',['require','exports','module','famous/core/Surface','famous/core/View','famous/utilities/Utility','famous/views/RenderController','famous/core/Transform','famous/transitions/Transitionable','famous/core/Engine'],function(require, exports, module) {
    var Surface = require('famous/core/Surface');
    var View = require('famous/core/View');
    var Utility = require('famous/utilities/Utility');
    var RenderController = require('famous/views/RenderController');
    var Transform          = require('famous/core/Transform');
    var Transitionable = require('famous/transitions/Transitionable');
    var Engine      = require('famous/core/Engine');

    function ActivityHolder(options) {
        View.apply(this, arguments);
        this.renderController = new RenderController({
            inTransition: this.options.inTransition,
            outTransition: this.options.outTransition
        });
        this._activityCache = {};
        this.currentActivity = undefined;
        this.add(this.renderController);
    }

    ActivityHolder.DEFAULT_OPTIONS = {
        inTransition: { duration: 300, curve: 'easeIn' },
        outTransition: { duration: 300, curve: 'easeIn' }
    };

    ActivityHolder.prototype = Object.create(View.prototype);
    ActivityHolder.prototype.constructor = ActivityHolder;
    ActivityHolder.prototype.ANIMATION = {
        slideFromRight: {
            transformIn: function(progress) {
                return Transform.translate((1 - progress)*window.innerWidth, 0);
            },
            transformOut: function(progress) {
                return Transform.translate((progress-1)*window.innerWidth, 0);
            },
            opacityIn: function(progress) {
                return 1;
            },
            opacityOut: function(progress) {
                return 1;
            }
        },
        slideFromLeft: {
            transformIn: function(progress) {
                return Transform.translate((progress-1)*window.innerWidth, 0);
            },
            transformOut: function(progress) {
                return Transform.translate((1 - progress)*window.innerWidth, 0);
            },
            opacityIn: function(progress) {
                return 1;
            },
            opacityOut: function(progress) {
                return 1;
            }
        },
        fadeIn: {
            transformIn: function(progress) {
                return Transform.identity;
            },
            transformOut: function(progress) {
                return Transform.identity;
            },
            opacityIn: function(progress) {
                return progress;
            },
            opacityOut: function(progress) {
                return 1;
            }
        }
    };

    ActivityHolder.prototype.showActivity = function(activity, transitionMap, parameters) {
        if (!transitionMap) transitionMap = this.ANIMATION.slideFromRight;
        this.renderController.inTransformFrom(transitionMap.transformIn);
        this.renderController.outTransformFrom(transitionMap.transformOut);
        this.renderController.inOpacityFrom(transitionMap.opacityIn);
        this.renderController.outOpacityFrom(transitionMap.opacityIn);
        activity.beforeOpening(window.App, parameters);
        activity.prepareBottomToolbar(window.App, window.App.bottomToolbar);
        activity.prepareNavigationBar(window.App, window.App.header);
        window.App.header.setBackButtonEnabled(activity.onBackAction !== false);
        window.App.header.setMoreButtonEnabled(activity.onMoreAction !== false);
        if (this.currentActivity) {
            window.App.contentContainer.removeClass('activity-'+this.currentActivity.constructor.name);
        }
        window.App.contentContainer.addClass('activity-'+activity.constructor.name);
        this.currentActivity = activity;
        this.renderController.show(activity);
    };

    ActivityHolder.prototype.showCachedActivity = function(activity, transitionMap, parameters) {
        var activityObj = this.getCachedActivity(activity);
        if (!activityObj) {
            window.console.error('Unable to find activity ' + activity + ' in cache');
            return;
        }
        this.showActivity(activityObj, transitionMap, parameters);
    };

    ActivityHolder.prototype.cacheActivity = function(activityInstance, id) {
        if (!id) {
            id = '';
        }
        this._activityCache[id] = activityInstance;
        return id;
    };

    ActivityHolder.prototype.getCachedActivity = function(idOrClass) {
        return this._activityCache[idOrClass];
    };

    ActivityHolder.prototype.createActivity = function(activity, options) {
        if (!options) options = {};
        options.size = this.getSize();
        var obj = new activity(options, window.App);
        return obj;
    };

    ActivityHolder.prototype.createCachedActivity = function(activity, options) {
        this.cacheActivity(this.createActivity(activity, options), activity.name);

    };

    module.exports = ActivityHolder;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/ViewSequence',['require','exports','module'],function(require, exports, module) {

    /**
     * Helper object used to iterate through items sequentially. Used in
     *   views that deal with layout.  A ViewSequence object conceptually points
     *   to a node in a linked list.
     *
     * @class ViewSequence
     *
     * @constructor
     * @param {Object|Array} options Options object, or content array.
     * @param {Number} [options.index] starting index.
     * @param {Number} [options.array] Array of elements to populate the ViewSequence
     * @param {Object} [options._] Optional backing store (internal
     * @param {Boolean} [options.loop] Whether to wrap when accessing elements just past the end
     *   (or beginning) of the sequence.
     */
    function ViewSequence(options) {
        if (!options) options = [];
        if (options instanceof Array) options = {array: options};

        this._ = null;
        this.index = options.index || 0;

        if (options.array) this._ = new (this.constructor.Backing)(options.array);
        else if (options._) this._ = options._;

        if (this.index === this._.firstIndex) this._.firstNode = this;
        if (this.index === this._.firstIndex + this._.array.length - 1) this._.lastNode = this;

        if (options.loop !== undefined) this._.loop = options.loop;

        this._previousNode = null;
        this._nextNode = null;
    }

    // constructor for internal storage
    ViewSequence.Backing = function Backing(array) {
        this.array = array;
        this.firstIndex = 0;
        this.loop = false;
        this.firstNode = null;
        this.lastNode = null;
    };

    // Get value "i" slots away from the first index.
    ViewSequence.Backing.prototype.getValue = function getValue(i) {
        var _i = i - this.firstIndex;
        if (_i < 0 || _i >= this.array.length) return null;
        return this.array[_i];
    };

    // Set value "i" slots away from the first index.
    ViewSequence.Backing.prototype.setValue = function setValue(i, value) {
        this.array[i - this.firstIndex] = value;
    };

    // After splicing into the backing store, restore the indexes of each node correctly.
    ViewSequence.Backing.prototype.reindex = function reindex(start, removeCount, insertCount) {
        var i = 0;
        var index = this.firstIndex;
        var indexShiftAmount = insertCount - removeCount;
        var node = this.firstNode;
        
        if(start === this.firstIndex) {
            for (var i = 0; i < removeCount; i++) {
                this.firstNode = this.firstNode.getNext();
            }
            this.firstNode.index = this.firstIndex;
        }

        // find node to begin
        while (index < start - 1) {
            node = node.getNext();
            index++;
        }
        // skip removed nodes
        var spliceStartNode = node;
        for (i = 0; i < removeCount; i++) {
            node = node.getNext();
            if (node) node._previousNode = spliceStartNode;
        }
        var spliceResumeNode = node ? node.getNext() : null;
        // generate nodes for inserted items
        spliceStartNode._nextNode = null;
        node = spliceStartNode;
        for (i = 0; i < insertCount; i++) node = node.getNext();
        index += insertCount;
        // resume the chain
        if (node !== spliceResumeNode) {
            node._nextNode = spliceResumeNode;
            if (spliceResumeNode) spliceResumeNode._previousNode = node;
        }
        if (spliceResumeNode) {
            node = spliceResumeNode;
            index++;
            while (node && index < this.array.length + this.firstIndex) {
                if (node._nextNode) node.index += indexShiftAmount;
                else node.index = index;
                node = node.getNext();
                index++;
            }
        }
    };

    /**
     * Return ViewSequence node previous to this node in the list, respecting looping if applied.
     *
     * @method getPrevious
     * @return {ViewSequence} previous node.
     */
    ViewSequence.prototype.getPrevious = function getPrevious() {
        if (this.index === this._.firstIndex) {
            if (this._.loop) {
                this._previousNode = this._.lastNode || new (this.constructor)({_: this._, index: this._.firstIndex + this._.array.length - 1});
                this._previousNode._nextNode = this;
            }
            else {
                this._previousNode = null;
            }
        }
        else if (!this._previousNode) {
            this._previousNode = new (this.constructor)({_: this._, index: this.index - 1});
            this._previousNode._nextNode = this;
        }
        return this._previousNode;
    };

    /**
     * Return ViewSequence node next after this node in the list, respecting looping if applied.
     *
     * @method getNext
     * @return {ViewSequence} previous node.
     */
    ViewSequence.prototype.getNext = function getNext() {
        if (this.index === this._.firstIndex + this._.array.length - 1) {
            if (this._.loop) {
                this._nextNode = this._.firstNode || new (this.constructor)({_: this._, index: this._.firstIndex});
                this._nextNode._previousNode = this;
            }
            else {
                this._nextNode = null;
            }
        }
        else if (!this._nextNode) {
            this._nextNode = new (this.constructor)({_: this._, index: this.index + 1});
            this._nextNode._previousNode = this;
        }
        return this._nextNode;
    };

    /**
     * Return index of this ViewSequence node.
     *
     * @method getIndex
     * @return {Number} index
     */
    ViewSequence.prototype.getIndex = function getIndex() {
        return this.index;
    };

    /**
     * Return printable version of this ViewSequence node.
     *
     * @method toString
     * @return {string} this index as a string
     */
    ViewSequence.prototype.toString = function toString() {
        return '' + this.index;
    };

    /**
     * Add one or more objects to the beginning of the sequence.
     *
     * @method unshift
     * @param {...Object} value arguments array of objects
     */
    ViewSequence.prototype.unshift = function unshift(value) {
        this._.array.unshift.apply(this._.array, arguments);
        this._.firstIndex -= arguments.length;
    };

    /**
     * Add one or more objects to the end of the sequence.
     *
     * @method push
     * @param {...Object} value arguments array of objects
     */
    ViewSequence.prototype.push = function push(value) {
        this._.array.push.apply(this._.array, arguments);
    };

    /**
     * Remove objects from the sequence
     *
     * @method splice
     * @param {Number} index starting index for removal
     * @param {Number} howMany how many elements to remove
     * @param {...Object} value arguments array of objects
     */
    ViewSequence.prototype.splice = function splice(index, howMany) {
        var values = Array.prototype.slice.call(arguments, 2);
        this._.array.splice.apply(this._.array, [index - this._.firstIndex, howMany].concat(values));
        this._.reindex(index, howMany, values.length);
    };

    /**
     * Exchange this element's sequence position with another's.
     *
     * @method swap
     * @param {ViewSequence} other element to swap with.
     */
    ViewSequence.prototype.swap = function swap(other) {
        var otherValue = other.get();
        var myValue = this.get();
        this._.setValue(this.index, otherValue);
        this._.setValue(other.index, myValue);

        var myPrevious = this._previousNode;
        var myNext = this._nextNode;
        var myIndex = this.index;
        var otherPrevious = other._previousNode;
        var otherNext = other._nextNode;
        var otherIndex = other.index;

        this.index = otherIndex;
        this._previousNode = (otherPrevious === this) ? other : otherPrevious;
        if (this._previousNode) this._previousNode._nextNode = this;
        this._nextNode = (otherNext === this) ? other : otherNext;
        if (this._nextNode) this._nextNode._previousNode = this;

        other.index = myIndex;
        other._previousNode = (myPrevious === other) ? this : myPrevious;
        if (other._previousNode) other._previousNode._nextNode = other;
        other._nextNode = (myNext === other) ? this : myNext;
        if (other._nextNode) other._nextNode._previousNode = other;

        if (this.index === this._.firstIndex) this._.firstNode = this;
        else if (this.index === this._.firstIndex + this._.array.length - 1) this._.lastNode = this;
        if (other.index === this._.firstIndex) this._.firstNode = other;
        else if (other.index === this._.firstIndex + this._.array.length - 1) this._.lastNode = other;
    };

   /**
     * Return value of this ViewSequence node.
     *
     * @method get
     * @return {Object} value of thiss
     */
    ViewSequence.prototype.get = function get() {
        return this._.getValue(this.index);
    };

   /**
     * Call getSize() on the contained View.
     *
     * @method getSize
     * @return {Array.Number} [width, height]
     */
    ViewSequence.prototype.getSize = function getSize() {
        var target = this.get();
        return target ? target.getSize() : null;
    };

    /**
     * Generate a render spec from the contents of this component.
     * Specifically, this will render the value at the current index.
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    ViewSequence.prototype.render = function render() {
        var target = this.get();
        return target ? target.render.apply(target, arguments) : null;
    };

    module.exports = ViewSequence;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: felix@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/views/SequentialLayout',['require','exports','module','famous/core/OptionsManager','famous/core/Transform','famous/core/ViewSequence','famous/utilities/Utility'],function(require, exports, module) {
    var OptionsManager = require('famous/core/OptionsManager');
    var Transform = require('famous/core/Transform');
    var ViewSequence = require('famous/core/ViewSequence');
    var Utility = require('famous/utilities/Utility');

    /**
     * SequentialLayout will lay out a collection of renderables sequentially in the specified direction.
     * @class ScrollContainer
     * @constructor
     * @param {Options} [options] An object of configurable options.
     * @param {Number} [options.direction=Utility.Direction.Y] Using the direction helper found in the famous Utility
     * module, this option will lay out the SequentialLayout instance's renderables either horizontally
     * (x) or vertically (y). Utility's direction is essentially either zero (X) or one (Y), so feel free
     * to just use integers as well.
     * @param {Array.Number} [options.defaultItemSize=[50, 50]] In the case where a renderable layed out
     * under SequentialLayout's control doesen't have a getSize method, SequentialLayout will assign it
     * this default size. (Commonly a case with Views).
     */
    function SequentialLayout(options) {
        this._items = null;
        this._size = null;
        this._outputFunction = SequentialLayout.DEFAULT_OUTPUT_FUNCTION;

        this.options = Object.create(this.constructor.DEFAULT_OPTIONS);
        this.optionsManager = new OptionsManager(this.options);

        if (options) this.setOptions(options);
    }

    SequentialLayout.DEFAULT_OPTIONS = {
        direction: Utility.Direction.Y,
        defaultItemSize: [50, 50]
    };

    SequentialLayout.DEFAULT_OUTPUT_FUNCTION = function DEFAULT_OUTPUT_FUNCTION(input, offset, index) {
        var transform = (this.options.direction === Utility.Direction.X) ? Transform.translate(offset, 0) : Transform.translate(0, offset);
        return {
            transform: transform,
            target: input.render()
        };
    };

    /**
     * Returns the width and the height of the SequentialLayout instance.
     *
     * @method getSize
     * @return {Array} A two value array of the SequentialLayout instance's current width and height (in that order).
     */
    SequentialLayout.prototype.getSize = function getSize() {
        if (!this._size) this.render(); // hack size in
        return this._size;
    };

    /**
     * Sets the collection of renderables under the SequentialLayout instance's control.
     *
     * @method sequenceFrom
     * @param {Array|ViewSequence} items Either an array of renderables or a Famous viewSequence.
     * @chainable
     */
    SequentialLayout.prototype.sequenceFrom = function sequenceFrom(items) {
        if (items instanceof Array) items = new ViewSequence(items);
        this._items = items;
        return this;
    };

    /**
     * Patches the SequentialLayout instance's options with the passed-in ones.
     *
     * @method setOptions
     * @param {Options} options An object of configurable options for the SequentialLayout instance.
     * @chainable
     */
    SequentialLayout.prototype.setOptions = function setOptions(options) {
        this.optionsManager.setOptions.apply(this.optionsManager, arguments);
        return this;
    };

    /**
     * setOutputFunction is used to apply a user-defined output transform on each processed renderable.
     * For a good example, check out SequentialLayout's own DEFAULT_OUTPUT_FUNCTION in the code.
     *
     * @method setOptions
     * @param {Function} outputFunction An output processer for each renderable in the SequentialLayout
     * instance.
     * @chainable
     */
    SequentialLayout.prototype.setOutputFunction = function setOutputFunction(outputFunction) {
        this._outputFunction = outputFunction;
        return this;
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    SequentialLayout.prototype.render = function render() {
        var length = 0;
        var girth = 0;

        var lengthDim = (this.options.direction === Utility.Direction.X) ? 0 : 1;
        var girthDim = (this.options.direction === Utility.Direction.X) ? 1 : 0;

        var currentNode = this._items;
        var result = [];
        while (currentNode) {
            var item = currentNode.get();

            var itemSize;
            if (item && item.getSize) itemSize = item.getSize();
            if (!itemSize) itemSize = this.options.defaultItemSize;
            if (itemSize[girthDim] !== true) girth = Math.max(girth, itemSize[girthDim]);

            var output = this._outputFunction.call(this, item, length, result.length);
            result.push(output);

            if (itemSize[lengthDim] && (itemSize[lengthDim] !== true)) length += itemSize[lengthDim];
            currentNode = currentNode.getNext();
        }

        if (!girth) girth = undefined;

        if (!this._size) this._size = [0, 0];
        this._size[lengthDim] = length;
        this._size[girthDim] = girth;

        return {
            size: this.getSize(),
            target: result
        };
    };

    module.exports = SequentialLayout;
});

define('widgets/common/BottomToolbar',['require','exports','module','famous/core/Surface','famous/views/SequentialLayout','famous/surfaces/ContainerSurface','famous/core/View','famous/core/Modifier','famous/core/Transform','famous/utilities/Utility'],function(require, exports, module) {
    var Surface = require('famous/core/Surface');
    var SequentialLayout = require('famous/views/SequentialLayout');
    var ContainerSurface = require('famous/surfaces/ContainerSurface');
    var View = require('famous/core/View');
    var Modifier = require('famous/core/Modifier');
    var Transform          = require('famous/core/Transform');
    var Utility = require('famous/utilities/Utility');

    /**
     *
     * @extends View
     * @param options
     *
     * @constructor
     */
    function BottomToolbar(options) {
        View.apply(this, arguments);
        if (options) this.setOptions(options);
        var container = new ContainerSurface({
            classes: this.options.classes
        });
        var layout = new SequentialLayout({
            direction: Utility.Direction.X
        });
        this.items = [];
        var items = this.items;
        layout.sequenceFrom(items);
        // Calculating item sizes
        var autosize = [undefined, this.getSize()[1]];
        // Creating items
        for (var i = 0; i < options.items.length; i++) {
            var item = options.items[i];
            if (this.options.autosize) {
                item.size = autosize;
            }
            this._eventOutput.subscribe(item);
            items.push(item);
        }

        var modifier = new Modifier({
            transform: Transform.translate(0.5, 0),
            origin: [0.5, 0]
        });
        container.add(modifier).add(layout);
        this.add(container);
    }

    BottomToolbar.DEFAULT_OPTIONS = {
        size: [undefined, 50],
        classes: ['bottom-navigation'],
        items: [],
        autosize: true
    };

    BottomToolbar.prototype = Object.create(View.prototype);
    BottomToolbar.prototype.constructor = BottomToolbar;

    BottomToolbar.prototype.setActiveItem = function(item) {
        for (var i = 0; i < this.items.length; i++) {
            this.items[i].setActiveState(this.items[i] === item);
        }
    };

    module.exports = BottomToolbar;
});

//     Underscore.js 1.6.0
//     http://underscorejs.org
//     (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.6.0';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return obj;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
    return obj;
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var result;
    any(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(predicate, context);
    each(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, function(value, index, list) {
      return !predicate.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(predicate, context);
    each(obj, function(value, index, list) {
      if (!(result = result && predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(predicate, context);
    each(obj, function(value, index, list) {
      if (result || (result = predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matches(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matches(attrs));
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    var result = -Infinity, lastComputed = -Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed > lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    var result = Infinity, lastComputed = Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed < lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Shuffle an array, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (obj.length !== +obj.length) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return value;
    return _.property(value);
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    iterator = lookupIterator(iterator);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iterator, context) {
      var result = {};
      iterator = lookupIterator(iterator);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    _.has(result, key) ? result[key].push(value) : result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[0];
    if (n < 0) return [];
    return slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[array.length - 1];
    return slice.call(array, Math.max(array.length - n, 0));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Split an array into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(array, predicate) {
    var pass = [], fail = [];
    each(array, function(elem) {
      (predicate(elem) ? pass : fail).push(elem);
    });
    return [pass, fail];
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.contains(other, item);
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, 'length').concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    return function() {
      var position = 0;
      var args = boundArgs.slice();
      for (var i = 0, length = args.length; i < length; i++) {
        if (args[i] === _) args[i] = arguments[position++];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return func.apply(this, args);
    };
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error('bindAll must be passed function names');
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;
      if (last < wait) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))
                        && ('constructor' in a && 'constructor' in b)) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  _.constant = function(value) {
    return function () {
      return value;
    };
  };

  _.property = function(key) {
    return function(obj) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of `key:value` pairs.
  _.matches = function(attrs) {
    return function(obj) {
      if (obj === attrs) return true; //avoid comparing an object to itself.
      for (var key in attrs) {
        if (attrs[key] !== obj[key])
          return false;
      }
      return true;
    }
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() { return new Date().getTime(); };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}).call(this);

define('widgets/common/BottomToolbarItem',['require','exports','module','famous/core/Surface','famous/core/View','underscore'],function(require, exports, module) {
    var Surface = require('famous/core/Surface');
    var View = require('famous/core/View');
    var _ = require('underscore');

    /**
     *
     * @extends View
     * @param options
     *
     * @constructor
     */
    function BottomToolbarItem(options) {
        View.apply(this, arguments);
        if (options) this.setOptions(options);
        this._surface = new Surface({
            origin: [0.5, 0.5],
            size: this.options.size,
            classes: this.options.classes,
            content: this._itemRenderer(this.options)
        });
        this.id=this.options.id;
        this._surface.on('click', function() {
            if (this.options.onClick) {
                this.options.onClick(this);
            }
            this._eventOutput.emit('toolbar-item-clicked', {target: this});
        }.bind(this));
        this._add(this._surface);
    }

    BottomToolbarItem.DEFAULT_OPTIONS = {
        size: [100, undefined],
        classes: ['toolbar-item'],
        iconClass: undefined,
        text: undefined,
        id: undefined,
        onClick: function(target) {}
    };

    BottomToolbarItem.prototype = Object.create(View.prototype);
    BottomToolbarItem.prototype.constructor = BottomToolbarItem;
    BottomToolbarItem.prototype.setActiveState = function(isActive) {
        var newClasslist = _.without(this._surface.getClassList(), 'active');
        if (isActive) {
            newClasslist.push('active');
        }
        this._surface.setClasses(newClasslist);
        //this._surface.commit(window.App.context);
    };

    BottomToolbarItem.prototype._itemRenderer = _.template(
        '<div id="<%= id %>"><div class="toolbar-icon <%= iconClass %>"></div><div><%= text %></div></div>'
    );

    module.exports = BottomToolbarItem;
});

/**
 * Created by LOGICIFY\corvis on 4/12/14.
 */
define('activity/common/Activity',['require','exports','module','famous/core/View'],function(require, exports, module) {
    var View = require('famous/core/View');

    function Activity(options) {
        View.apply(this, arguments);
    }

    Activity.prototype = Object.create(View.prototype);
    Activity.prototype.constructor = Activity;

    /**
     * Will be invoked before activity holder starts loading this activity.
     * @param app
     */
    Activity.prototype.beforeOpening = function(app, parameters) {

    };

    Activity.prototype.prepareNavigationBar = function(app, navigationBar) {

    };

    Activity.prototype.prepareBottomToolbar = function(app, bottomToolbar) {

    };

    /**
     * Should be callback which takes 2 parameters: app, defaultBackAnimation
     * @param app
     * @param defaultBackAnimation
     */
    Activity.prototype.onBackAction = false;

    /**
     * Should be callback
     * @param app
     * @param defaultBackAnimation
     */
    Activity.prototype.onMoreAction = false;

    module.exports = Activity;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */
define('famous/physics/PhysicsEngine',['require','exports','module','famous/core/EventHandler'],function(require, exports, module) {
    var EventHandler = require('famous/core/EventHandler');

    /**
     * The Physics Engine is responsible for mediating Bodies and their
     * interaction with forces and constraints. The Physics Engine handles the
     * logic of adding and removing bodies, updating their state of the over
     * time.
     *
     * @class PhysicsEngine
     * @constructor
     * @param optoins {Object} options
     */
    function PhysicsEngine(options) {
        this.options = Object.create(PhysicsEngine.DEFAULT_OPTIONS);
        if (options) this.setOptions(options);

        this._particles      = [];   //list of managed particles
        this._bodies         = [];   //list of managed bodies
        this._agents         = {};   //hash of managed agents
        this._forces         = [];   //list of IDs of agents that are forces
        this._constraints    = [];   //list of IDs of agents that are constraints

        this._buffer         = 0.0;
        this._timestamp      = 17;
        this._minTimeStep    = 1000 / 120;
        this._maxTimestep    = 17;
        this._prevTime       = now();
        this._isSleeping     = false;
        this._eventHandler   = null;
        this._currAgentId    = 0;
        this._hasBodies      = false;
    }

    /**
     * @property PhysicsEngine.DEFAULT_OPTIONS
     * @type Object
     * @protected
     * @static
     */
    PhysicsEngine.DEFAULT_OPTIONS = {

        /**
         * The number of iterations the engine takes to resolve constraints
         * @attribute constraintSteps
         * @type Number
         */
        constraintSteps : 1,

        /**
         * The energy threshold before the Engine stops updating
         * @attribute sleepTolerance
         * @type Number
         */
        sleepTolerance  : 1e-7
    };

    var now = (function() {
        return Date.now;
    })();

    /**
     * Options setter
     * @method setOptions
     * @param options {Object}
     */
    PhysicsEngine.prototype.setOptions = function setOptions(opts) {
        for (var key in opts) if (this.options[key]) this.options[key] = opts[key];
    };

    /**
     * Method to add a physics body to the engine. Necessary to update the
     * body over time.
     *
     * @method addBody
     * @param body {Body}
     * @return body {Body}
     */
    PhysicsEngine.prototype.addBody = function addBody(body) {
        body._engine = this;
        if (body.isBody) {
            this._bodies.push(body);
            this._hasBodies = true;
        }
        else this._particles.push(body);
        return body;
    };

    /**
     * Remove a body from the engine. Detaches body from all forces and
     * constraints.
     *
     * @method removeBody
     * @param body {Body}
     */
    PhysicsEngine.prototype.removeBody = function removeBody(body) {
        var array = (body.isBody) ? this._bodies : this._particles;
        var index = array.indexOf(body);
        if (index > -1) {
            for (var i = 0; i < Object.keys(this._agents); i++) this.detachFrom(i, body);
            array.splice(index,1);
        }
        if (this.getBodies().length === 0) this._hasBodies = false;
    };

    function _mapAgentArray(agent) {
        if (agent.applyForce)      return this._forces;
        if (agent.applyConstraint) return this._constraints;
    }

    function _attachOne(agent, targets, source) {
        if (targets === undefined) targets = this.getParticlesAndBodies();
        if (!(targets instanceof Array)) targets = [targets];

        this._agents[this._currAgentId] = {
            agent   : agent,
            targets : targets,
            source  : source
        };

        _mapAgentArray.call(this, agent).push(this._currAgentId);
        return this._currAgentId++;
    }

    /**
     * Attaches a force or constraint to a Body. Returns an AgentId of the
     * attached agent which can be used to detach the agent.
     *
     * @method attach
     * @param agent {Agent|Array.Agent} A force, constraint, or array of them.
     * @param [targets=All] {Body|Array.Body} The Body or Bodies affected by the agent
     * @param [source] {Body} The source of the agent
     * @return AgentId {Number}
     */
    PhysicsEngine.prototype.attach = function attach(agents, targets, source) {
        if (agents instanceof Array) {
            var agentIDs = [];
            for (var i = 0; i < agents.length; i++)
                agentIDs[i] = _attachOne.call(this, agents[i], targets, source);
            return agentIDs;
        }
        else return _attachOne.call(this, agents, targets, source);
    };

    /**
     * Append a body to the targets of a previously defined physics agent.
     *
     * @method attachTo
     * @param agentID {AgentId} The agentId of a previously defined agent
     * @param target {Body} The Body affected by the agent
     */
    PhysicsEngine.prototype.attachTo = function attachTo(agentID, target) {
        _getBoundAgent.call(this, agentID).targets.push(target);
    };

    /**
     * Undoes PhysicsEngine.attach. Removes an agent and its associated
     * effect on its affected Bodies.
     *
     * @method detach
     * @param agentID {AgentId} The agentId of a previously defined agent
     */
    PhysicsEngine.prototype.detach = function detach(id) {
        // detach from forces/constraints array
        var agent = this.getAgent(id);
        var agentArray = _mapAgentArray.call(this, agent);
        var index = agentArray.indexOf(id);
        agentArray.splice(index,1);

        // detach agents array
        delete this._agents[id];
    };

    /**
     * Remove a single Body from a previously defined agent.
     *
     * @method detach
     * @param agentID {AgentId} The agentId of a previously defined agent
     * @param target {Body} The body to remove from the agent
     */
    PhysicsEngine.prototype.detachFrom = function detachFrom(id, target) {
        var boundAgent = _getBoundAgent.call(this, id);
        if (boundAgent.source === target) this.detach(id);
        else {
            var targets = boundAgent.targets;
            var index = targets.indexOf(target);
            if (index > -1) targets.splice(index,1);
        }
    };

    /**
     * A convenience method to give the Physics Engine a clean slate of
     * agents. Preserves all added Body objects.
     *
     * @method detachAll
     */
    PhysicsEngine.prototype.detachAll = function detachAll() {
        this._agents        = {};
        this._forces        = [];
        this._constraints   = [];
        this._currAgentId   = 0;
    };

    function _getBoundAgent(id) {
        return this._agents[id];
    }

    /**
     * Returns the corresponding agent given its agentId.
     *
     * @method getAgent
     * @param id {AgentId}
     */
    PhysicsEngine.prototype.getAgent = function getAgent(id) {
        return _getBoundAgent.call(this, id).agent;
    };

    /**
     * Returns all particles that are currently managed by the Physics Engine.
     *
     * @method getParticles
     * @return particles {Array.Particles}
     */
    PhysicsEngine.prototype.getParticles = function getParticles() {
        return this._particles;
    };

    /**
     * Returns all bodies, except particles, that are currently managed by the Physics Engine.
     *
     * @method getBodies
     * @return bodies {Array.Bodies}
     */
    PhysicsEngine.prototype.getBodies = function getBodies() {
        return this._bodies;
    };

    /**
     * Returns all bodies that are currently managed by the Physics Engine.
     *
     * @method getBodies
     * @return bodies {Array.Bodies}
     */
    PhysicsEngine.prototype.getParticlesAndBodies = function getParticlesAndBodies() {
        return this.getParticles().concat(this.getBodies());
    };

    /**
     * Iterates over every Particle and applies a function whose first
     * argument is the Particle
     *
     * @method forEachParticle
     * @param fn {Function} Function to iterate over
     * @param [dt] {Number} Delta time
     */
    PhysicsEngine.prototype.forEachParticle = function forEachParticle(fn, dt) {
        var particles = this.getParticles();
        for (var index = 0, len = particles.length; index < len; index++)
            fn.call(this, particles[index], dt);
    };

    /**
     * Iterates over every Body that isn't a Particle and applies
     * a function whose first argument is the Body
     *
     * @method forEachBody
     * @param fn {Function} Function to iterate over
     * @param [dt] {Number} Delta time
     */
    PhysicsEngine.prototype.forEachBody = function forEachBody(fn, dt) {
        if (!this._hasBodies) return;
        var bodies = this.getBodies();
        for (var index = 0, len = bodies.length; index < len; index++)
            fn.call(this, bodies[index], dt);
    };

    /**
     * Iterates over every Body and applies a function whose first
     * argument is the Body
     *
     * @method forEach
     * @param fn {Function} Function to iterate over
     * @param [dt] {Number} Delta time
     */
    PhysicsEngine.prototype.forEach = function forEach(fn, dt) {
        this.forEachParticle(fn, dt);
        this.forEachBody(fn, dt);
    };

    function _updateForce(index) {
        var boundAgent = _getBoundAgent.call(this, this._forces[index]);
        boundAgent.agent.applyForce(boundAgent.targets, boundAgent.source);
    }

    function _updateForces() {
        for (var index = this._forces.length - 1; index > -1; index--)
            _updateForce.call(this, index);
    }

    function _updateConstraint(index, dt) {
        var boundAgent = this._agents[this._constraints[index]];
        return boundAgent.agent.applyConstraint(boundAgent.targets, boundAgent.source, dt);
    }

    function _updateConstraints(dt) {
        var iteration = 0;
        while (iteration < this.options.constraintSteps) {
            for (var index = this._constraints.length - 1; index > -1; index--)
                _updateConstraint.call(this, index, dt);
            iteration++;
        }
    }

    function _updateVelocities(particle, dt) {
        particle.integrateVelocity(dt);
    }

    function _updateAngularVelocities(body, dt) {
        body.integrateAngularMomentum(dt);
        body.updateAngularVelocity();
    }

    function _updateOrientations(body, dt) {
        body.integrateOrientation(dt);
    }

    function _updatePositions(particle, dt) {
        particle.integratePosition(dt);
        particle.emit('update', particle);
    }

    function _integrate(dt) {
        _updateForces.call(this, dt);
        this.forEach(_updateVelocities, dt);
        this.forEachBody(_updateAngularVelocities, dt);
        _updateConstraints.call(this, dt);
        this.forEachBody(_updateOrientations, dt);
        this.forEach(_updatePositions, dt);
    }

    function _getEnergyParticles() {
        var energy = 0.0;
        var particleEnergy = 0.0;
        this.forEach(function(particle) {
            particleEnergy = particle.getEnergy();
            energy += particleEnergy;
            if (particleEnergy < particle.sleepTolerance) particle.sleep();
        });
        return energy;
    }

    function _getEnergyForces() {
        var energy = 0;
        for (var index = this._forces.length - 1; index > -1; index--)
            energy += this._forces[index].getEnergy() || 0.0;
        return energy;
    }

    function _getEnergyConstraints() {
        var energy = 0;
        for (var index = this._constraints.length - 1; index > -1; index--)
            energy += this._constraints[index].getEnergy() || 0.0;
        return energy;
    }

    /**
     * Calculates the kinetic energy of all Body objects and potential energy
     * of all attached agents.
     *
     * TODO: implement.
     * @method getEnergy
     * @return energy {Number}
     */
    PhysicsEngine.prototype.getEnergy = function getEnergy() {
        return _getEnergyParticles.call(this) + _getEnergyForces.call(this) + _getEnergyConstraints.call(this);
    };

    /**
     * Updates all Body objects managed by the physics engine over the
     * time duration since the last time step was called.
     *
     * @method step
     */
    PhysicsEngine.prototype.step = function step() {
//        if (this.getEnergy() < this.options.sleepTolerance) {
//            this.sleep();
//            return;
//        };

        //set current frame's time
        var currTime = now();

        //milliseconds elapsed since last frame
        var dtFrame = currTime - this._prevTime;

        this._prevTime = currTime;

        if (dtFrame < this._minTimeStep) return;
        if (dtFrame > this._maxTimeStep) dtFrame = this._maxTimestep;

        //robust integration
//        this._buffer += dtFrame;
//        while (this._buffer > this._timestep){
//            _integrate.call(this, this._timestep);
//            this._buffer -= this._timestep;
//        };
//        _integrate.call(this, this._buffer);
//        this._buffer = 0.0;
        _integrate.call(this, this._timestamp);

//        this.emit('update', this);
    };

    /**
     * Tells whether the Physics Engine is sleeping or awake.
     * @method isSleeping
     * @return {Boolean}
     */
    PhysicsEngine.prototype.isSleeping = function isSleeping() {
        return this._isSleeping;
    };

    /**
     * Stops the Physics Engine from updating. Emits an 'end' event.
     * @method sleep
     */
    PhysicsEngine.prototype.sleep = function sleep() {
        this.emit('end', this);
        this._isSleeping = true;
    };

    /**
     * Starts the Physics Engine from updating. Emits an 'start' event.
     * @method wake
     */
    PhysicsEngine.prototype.wake = function wake() {
        this._prevTime = now();
        this.emit('start', this);
        this._isSleeping = false;
    };

    PhysicsEngine.prototype.emit = function emit(type, data) {
        if (this._eventHandler === null) return;
        this._eventHandler.emit(type, data);
    };

    PhysicsEngine.prototype.on = function on(event, fn) {
        if (this._eventHandler === null) this._eventHandler = new EventHandler();
        this._eventHandler.on(event, fn);
    };

    module.exports = PhysicsEngine;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/math/Vector',['require','exports','module'],function(require, exports, module) {

    /**
     * Three-element floating point vector.
     *
     * @class Vector
     * @constructor
     *
     * @param {number} x x element value
     * @param {number} y y element value
     * @param {number} z z element value
     */
    function Vector(x,y,z) {
        if (arguments.length === 1) this.set(x);
        else {
            this.x = x || 0;
            this.y = y || 0;
            this.z = z || 0;
        }
        return this;
    }

    var _register = new Vector(0,0,0);

    /**
     * Add this element-wise to another Vector, element-wise.
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method add
     * @param {Vector} v addend
     * @return {Vector} vector sum
     */
    Vector.prototype.add = function add(v) {
        return _setXYZ.call(_register,
            this.x + v.x,
            this.y + v.y,
            this.z + v.z
        );
    };

    /**
     * Subtract another vector from this vector, element-wise.
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method sub
     * @param {Vector} v subtrahend
     * @return {Vector} vector difference
     */
    Vector.prototype.sub = function sub(v) {
        return _setXYZ.call(_register,
            this.x - v.x,
            this.y - v.y,
            this.z - v.z
        );
    };

    /**
     * Scale Vector by floating point r.
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method mult
     *
     * @param {number} r scalar
     * @return {Vector} vector result
     */
    Vector.prototype.mult = function mult(r) {
        return _setXYZ.call(_register,
            r * this.x,
            r * this.y,
            r * this.z
        );
    };

    /**
     * Scale Vector by floating point 1/r.
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method div
     *
     * @param {number} r scalar
     * @return {Vector} vector result
     */
    Vector.prototype.div = function div(r) {
        return this.mult(1 / r);
    };

    /**
     * Given another vector v, return cross product (v)x(this).
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method cross
     * @param {Vector} v Left Hand Vector
     * @return {Vector} vector result
     */
    Vector.prototype.cross = function cross(v) {
        var x = this.x;
        var y = this.y;
        var z = this.z;
        var vx = v.x;
        var vy = v.y;
        var vz = v.z;

        return _setXYZ.call(_register,
            z * vy - y * vz,
            x * vz - z * vx,
            y * vx - x * vy
        );
    };

    /**
     * Component-wise equality test between this and Vector v.
     * @method equals
     * @param {Vector} v vector to compare
     * @return {boolean}
     */
    Vector.prototype.equals = function equals(v) {
        return (v.x === this.x && v.y === this.y && v.z === this.z);
    };

    /**
     * Rotate clockwise around x-axis by theta radians.
     *   Note: This sets the internal result register, so other references to that vector will change.
     * @method rotateX
     * @param {number} theta radians
     * @return {Vector} rotated vector
     */
    Vector.prototype.rotateX = function rotateX(theta) {
        var x = this.x;
        var y = this.y;
        var z = this.z;

        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);

        return _setXYZ.call(_register,
            x,
            y * cosTheta - z * sinTheta,
            y * sinTheta + z * cosTheta
        );
    };

    /**
     * Rotate clockwise around y-axis by theta radians.
     *   Note: This sets the internal result register, so other references to that vector will change.
     * @method rotateY
     * @param {number} theta radians
     * @return {Vector} rotated vector
     */
    Vector.prototype.rotateY = function rotateY(theta) {
        var x = this.x;
        var y = this.y;
        var z = this.z;

        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);

        return _setXYZ.call(_register,
            z * sinTheta + x * cosTheta,
            y,
            z * cosTheta - x * sinTheta
        );
    };

    /**
     * Rotate clockwise around z-axis by theta radians.
     *   Note: This sets the internal result register, so other references to that vector will change.
     * @method rotateZ
     * @param {number} theta radians
     * @return {Vector} rotated vector
     */
    Vector.prototype.rotateZ = function rotateZ(theta) {
        var x = this.x;
        var y = this.y;
        var z = this.z;

        var cosTheta = Math.cos(theta);
        var sinTheta = Math.sin(theta);

        return _setXYZ.call(_register,
            x * cosTheta - y * sinTheta,
            x * sinTheta + y * cosTheta,
            z
        );
    };

    /**
     * Return dot product of this with a second Vector
     * @method dot
     * @param {Vector} v second vector
     * @return {number} dot product
     */
    Vector.prototype.dot = function dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    };

    /**
     * Return squared length of this vector
     * @method normSquared
     * @return {number} squared length
     */
    Vector.prototype.normSquared = function normSquared() {
        return this.dot(this);
    };

    /**
     * Return length of this vector
     * @method norm
     * @return {number} length
     */
    Vector.prototype.norm = function norm() {
        return Math.sqrt(this.normSquared());
    };

    /**
     * Scale Vector to specified length.
     *   If length is less than internal tolerance, set vector to [length, 0, 0].
     *   Note: This sets the internal result register, so other references to that vector will change.
     * @method normalize
     *
     * @param {number} length target length, default 1.0
     * @return {Vector}
     */
    Vector.prototype.normalize = function normalize(length) {
        if (arguments.length === 0) length = 1;
        var norm = this.norm();

        if (norm > 1e-7) return _setFromVector.call(_register, this.mult(length / norm));
        else return _setXYZ.call(_register, length, 0, 0);
    };

    /**
     * Make a separate copy of the Vector.
     *
     * @method clone
     *
     * @return {Vector}
     */
    Vector.prototype.clone = function clone() {
        return new Vector(this);
    };

    /**
     * True if and only if every value is 0 (or falsy)
     *
     * @method isZero
     *
     * @return {boolean}
     */
    Vector.prototype.isZero = function isZero() {
        return !(this.x || this.y || this.z);
    };

    function _setXYZ(x,y,z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    function _setFromArray(v) {
        return _setXYZ.call(this,v[0],v[1],v[2] || 0);
    }

    function _setFromVector(v) {
        return _setXYZ.call(this, v.x, v.y, v.z);
    }

    function _setFromNumber(x) {
        return _setXYZ.call(this,x,0,0);
    }

    /**
     * Set this Vector to the values in the provided Array or Vector.
     *
     * @method set
     * @param {object} v array, Vector, or number
     * @return {Vector} this
     */
    Vector.prototype.set = function set(v) {
        if (v instanceof Array)    return _setFromArray.call(this, v);
        if (v instanceof Vector)   return _setFromVector.call(this, v);
        if (typeof v === 'number') return _setFromNumber.call(this, v);
    };

    Vector.prototype.setXYZ = function(x,y,z) {
        return _setXYZ.apply(this, arguments);
    };

    Vector.prototype.set1D = function(x) {
        return _setFromNumber.call(this, x);
    };

    /**
     * Put result of last internal register calculation in specified output vector.
     *
     * @method put
     * @param {Vector} v destination vector
     * @return {Vector} destination vector
     */

    Vector.prototype.put = function put(v) {
        _setFromVector.call(v, _register);
    };

    /**
     * Set this vector to [0,0,0]
     *
     * @method clear
     */
    Vector.prototype.clear = function clear() {
        return _setXYZ.call(this,0,0,0);
    };

    /**
     * Scale this Vector down to specified "cap" length.
     *   If Vector shorter than cap, or cap is Infinity, do nothing.
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method cap
     * @return {Vector} capped vector
     */
    Vector.prototype.cap = function cap(cap) {
        if (cap === Infinity) return _setFromVector.call(_register, this);
        var norm = this.norm();
        if (norm > cap) return _setFromVector.call(_register, this.mult(cap / norm));
        else return _setFromVector.call(_register, this);
    };

    /**
     * Return projection of this Vector onto another.
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method project
     * @param {Vector} n vector to project upon
     * @return {Vector} projected vector
     */
    Vector.prototype.project = function project(n) {
        return n.mult(this.dot(n));
    };

    /**
     * Reflect this Vector across provided vector.
     *   Note: This sets the internal result register, so other references to that vector will change.
     *
     * @method reflectAcross
     * @param {Vector} n vector to reflect across
     * @return {Vector} reflected vector
     */
    Vector.prototype.reflectAcross = function reflectAcross(n) {
        n.normalize().put(n);
        return _setFromVector(_register, this.sub(this.project(n).mult(2)));
    };

    /**
     * Convert Vector to three-element array.
     *
     * @method get
     * @return {array<number>} three-element array
     */
    Vector.prototype.get = function get() {
        return [this.x, this.y, this.z];
    };

    Vector.prototype.get1D = function() {
        return this.x;
    };

    module.exports = Vector;

});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/physics/integrators/SymplecticEuler',['require','exports','module','famous/core/OptionsManager'],function(require, exports, module) {
    var OptionsManager = require('famous/core/OptionsManager');

    /**
     * Ordinary Differential Equation (ODE) Integrator.
     * Manages updating a physics body's state over time.
     *
     *  p = position, v = velocity, m = mass, f = force, dt = change in time
     *
     *      v <- v + dt * f / m
     *      p <- p + dt * v
     *
     *  q = orientation, w = angular velocity, L = angular momentum
     *
     *      L <- L + dt * t
     *      q <- q + dt/2 * q * w
     *
     * @class SymplecticEuler
     * @constructor
     * @param {Object} options Options to set
     */
    function SymplecticEuler(options) {
        this.options = Object.create(SymplecticEuler.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);

        if (options) this.setOptions(options);
    }

    /**
     * @property SymplecticEuler.DEFAULT_OPTIONS
     * @type Object
     * @protected
     * @static
     */
    SymplecticEuler.DEFAULT_OPTIONS = {

        /**
         * The maximum velocity of a physics body
         *      Range : [0, Infinity]
         * @attribute velocityCap
         * @type Number
         */

        velocityCap : undefined,

        /**
         * The maximum angular velocity of a physics body
         *      Range : [0, Infinity]
         * @attribute angularVelocityCap
         * @type Number
         */
        angularVelocityCap : undefined
    };

    /*
     * Setter for options
     *
     * @method setOptions
     * @param {Object} options
     */
    SymplecticEuler.prototype.setOptions = function setOptions(options) {
        this._optionsManager.patch(options);
    };

    /*
     * Getter for options
     *
     * @method getOptions
     * @return {Object} options
     */
    SymplecticEuler.prototype.getOptions = function getOptions() {
        return this._optionsManager.value();
    };

    /*
     * Updates the velocity of a physics body from its accumulated force.
     *      v <- v + dt * f / m
     *
     * @method integrateVelocity
     * @param {Body} physics body
     * @param {Number} dt delta time
     */
    SymplecticEuler.prototype.integrateVelocity = function integrateVelocity(body, dt) {
        var v = body.velocity;
        var w = body.inverseMass;
        var f = body.force;

        if (f.isZero()) return;

        v.add(f.mult(dt * w)).put(v);
        f.clear();
    };

    /*
     * Updates the position of a physics body from its velocity.
     *      p <- p + dt * v
     *
     * @method integratePosition
     * @param {Body} physics body
     * @param {Number} dt delta time
     */
    SymplecticEuler.prototype.integratePosition = function integratePosition(body, dt) {
        var p = body.position;
        var v = body.velocity;

        if (this.options.velocityCap) v.cap(this.options.velocityCap).put(v);
        p.add(v.mult(dt)).put(p);
    };

    /*
     * Updates the angular momentum of a physics body from its accumuled torque.
     *      L <- L + dt * t
     *
     * @method integrateAngularMomentum
     * @param {Body} physics body (except a particle)
     * @param {Number} dt delta time
     */
    SymplecticEuler.prototype.integrateAngularMomentum = function integrateAngularMomentum(body, dt) {
        var L = body.angularMomentum;
        var t = body.torque;

        if (t.isZero()) return;

        if (this.options.angularVelocityCap) t.cap(this.options.angularVelocityCap).put(t);
        L.add(t.mult(dt)).put(L);
        t.clear();
    };

    /*
     * Updates the orientation of a physics body from its angular velocity.
     *      q <- q + dt/2 * q * w
     *
     * @method integrateOrientation
     * @param {Body} physics body (except a particle)
     * @param {Number} dt delta time
     */
    SymplecticEuler.prototype.integrateOrientation = function integrateOrientation(body, dt) {
        var q = body.orientation;
        var w = body.angularVelocity;

        if (w.isZero()) return;
        q.add(q.multiply(w).scalarMultiply(0.5 * dt)).put(q);
//        q.normalize.put(q);
    };

    module.exports = SymplecticEuler;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/physics/bodies/Particle',['require','exports','module','famous/math/Vector','famous/core/Transform','famous/core/EventHandler','../integrators/SymplecticEuler'],function(require, exports, module) {
    var Vector = require('famous/math/Vector');
    var Transform = require('famous/core/Transform');
    var EventHandler = require('famous/core/EventHandler');
    var Integrator = require('../integrators/SymplecticEuler');

    /**
     * A point body that is controlled by the Physics Engine. A particle has
     *   position and velocity states that are updated by the Physics Engine.
     *   Ultimately, a particle is a _special type of modifier, and can be added to
     *   the Famous render tree like any other modifier.
     *
     * @constructor
     * @class Particle
     * @uses EventHandler
     * @uses Modifier
     * @extensionfor Body
     */
     function Particle(options) {
        options = options || {};

        // registers
        this.position = new Vector();
        this.velocity = new Vector();
        this.force    = new Vector();

        var defaults  = Particle.DEFAULT_OPTIONS;

        // set vectors
        this.setPosition(options.position || defaults.position);
        this.setVelocity(options.velocity || defaults.velocity);
        this.force.set(options.force || [0,0,0]);

        // set scalars
        this.mass = (options.mass !== undefined)
            ? options.mass
            : defaults.mass;

        this.axis = (options.axis !== undefined)
            ? options.axis
            : defaults.axis;

        this.inverseMass = 1 / this.mass;

        // state variables
        this._isSleeping     = false;
        this._engine         = null;
        this._eventOutput    = null;
        this._positionGetter = null;

        this.transform = Transform.identity.slice();

        // cached _spec
        this._spec = {
            transform : this.transform,
            target    : null
        };
    }

    /**
     * @property Particle.DEFAULT_OPTIONS
     * @type Object
     * @protected
     * @static
     */
    Particle.DEFAULT_OPTIONS = {

        /**
         * The position of the particle
         * @attribute position
         * @type Array
         */
        position : [0,0,0],

        /**
         * The velocity of the particle
         * @attribute velocity
         * @type Array
         */
        velocity : [0,0,0],

        /**
         * The mass of the particle
         * @attribute mass
         * @type Number
         */
        mass : 1,

        /**
         * The axis a particle can move along. Can be bitwise ORed
         *    e.g., Particle.AXES.X, Particle.AXES.X | Particle.AXES.Y
         * @attribute axis
         * @type Hexadecimal
         */
        axis : undefined
    };

    /**
     * Kinetic energy threshold needed to update the body
     *
     * @property SLEEP_TOLERANCE
     * @type Number
     * @static
     * @default 1e-7
     */
    Particle.SLEEP_TOLERANCE = 1e-7;

    /**
     * Axes by which a body can translate
     *
     * @property AXES
     * @type Hexadecimal
     * @static
     * @default 1e-7
     */
    Particle.AXES = {
        X : 0x00, // hexadecimal for 0
        Y : 0x01, // hexadecimal for 1
        Z : 0x02  // hexadecimal for 2
    };

    // Integrator for updating the particle's state
    // TODO: make this a singleton
    Particle.INTEGRATOR = new Integrator();

    //Catalogue of outputted events
    var _events = {
        start  : 'start',
        update : 'update',
        end    : 'end'
    };

    // Cached timing function
    var now = (function() {
        return Date.now;
    })();

    /**
     * Stops the particle from updating
     * @method sleep
     */
    Particle.prototype.sleep = function sleep() {
        if (this._isSleeping) return;
        this.emit(_events.end, this);
        this._isSleeping = true;
    };

    /**
     * Starts the particle update
     * @method wake
     */
    Particle.prototype.wake = function wake() {
        if (!this._isSleeping) return;
        this.emit(_events.start, this);
        this._isSleeping = false;
        this._prevTime = now();
    };

    /**
     * @attribute isBody
     * @type Boolean
     * @static
     */
    Particle.prototype.isBody = false;

    /**
     * Basic setter for position
     * @method getPosition
     * @param position {Array|Vector}
     */
    Particle.prototype.setPosition = function setPosition(position) {
        this.position.set(position);
    };

    /**
     * 1-dimensional setter for position
     * @method setPosition1D
     * @param value {Number}
     */
    Particle.prototype.setPosition1D = function(x) {
        this.position.x = x;
    };

    /**
     * Basic getter function for position
     * @method getPosition
     * @return position {Array}
     */
    Particle.prototype.getPosition = function getPosition() {
        if (this._positionGetter instanceof Function)
            this.setPosition(this._positionGetter());

        this._engine.step();

        return this.position.get();
    };

    /**
     * 1-dimensional getter for position
     * @method getPosition1D
     * @return value {Number}
     */
    Particle.prototype.getPosition1D = function getPosition1D() {
        this._engine.step();
        return this.position.x;
    };

    /**
     * Defines the position from outside the Physics Engine
     * @method positionFrom
     * @param positionGetter {Function}
     */
    Particle.prototype.positionFrom = function positionFrom(positionGetter) {
        this._positionGetter = positionGetter;
    };

    /**
     * Basic setter function for velocity Vector
     * @method setVelocity
     * @function
     */
    Particle.prototype.setVelocity = function setVelocity(velocity) {
        this.velocity.set(velocity);
        this.wake();
    };

    /**
     * 1-dimensional setter for velocity
     * @method setVelocity1D
     * @param velocity {Number}
     */
    Particle.prototype.setVelocity1D = function(x) {
        this.velocity.x = x;
        this.wake();
    };

    /**
     * Basic getter function for velocity Vector
     * @method getVelocity
     * @return velocity {Array}
     */
    Particle.prototype.getVelocity = function getVelocity() {
        return this.velocity.get();
    };

    /**
     * 1-dimensional getter for velocity
     * @method getVelocity1D
     * @return velocity {Number}
     */
    Particle.prototype.getVelocity1D = function getVelocity1D() {
        return this.velocity.x;
    };

    /**
     * Basic setter function for mass quantity
     * @method setMass
     * @param mass {Number} mass
     */
    Particle.prototype.setMass = function setMass(mass) {
        this.mass = mass;
        this.inverseMass = 1 / mass;
    };

    /**
     * Basic getter function for mass quantity
     * @method getMass
     * @return mass {Number}
     */
    Particle.prototype.getMass = function getMass() {
        return this.mass;
    };

    /**
     * Reset position and velocity
     * @method reset
     * @param position {Array|Vector}
     * @param velocity {Array|Vector}
     */
    Particle.prototype.reset = function reset(position, velocity) {
        this.setPosition(position || [0,0,0]);
        this.setVelocity(velocity || [0,0,0]);
    };

    /**
     * Add force vector to existing internal force Vector
     * @method applyForce
     * @param force {Vector}
     */
    Particle.prototype.applyForce = function applyForce(force) {
        if (force.isZero()) return;
        this.force.add(force).put(this.force);
        this.wake();
    };

    /**
     * Add impulse (change in velocity) Vector to this Vector's velocity.
     * @method applyImpulse
     * @param impulse {Vector}
     */
    Particle.prototype.applyImpulse = function applyImpulse(impulse) {
        if (impulse.isZero()) return;
        var velocity = this.velocity;
        velocity.add(impulse.mult(this.inverseMass)).put(velocity);
    };

    /**
     * Update a particle's velocity from its force accumulator
     * @method integrateVelocity
     * @param dt {Number} Time differential
     */
    Particle.prototype.integrateVelocity = function integrateVelocity(dt) {
        Particle.INTEGRATOR.integrateVelocity(this, dt);
    };

    /**
     * Update a particle's position from its velocity
     * @method integratePosition
     * @param dt {Number} Time differential
     */
    Particle.prototype.integratePosition = function integratePosition(dt) {
        Particle.INTEGRATOR.integratePosition(this, dt);
    };

    /**
     * Update the position and velocity of the particle
     * @method _integrate
     * @protected
     * @param dt {Number} Time differential
     */
    Particle.prototype._integrate = function _integrate(dt) {
        this.integrateVelocity(dt);
        this.integratePosition(dt);
    };

    /**
     * Get kinetic energy of the particle.
     * @method getEnergy
     * @function
     */
    Particle.prototype.getEnergy = function getEnergy() {
        return 0.5 * this.mass * this.velocity.normSquared();
    };

    /**
     * Generate transform from the current position state
     * @method getTransform
     * @return Transform {Transform}
     */
    Particle.prototype.getTransform = function getTransform() {
        this._engine.step();

        var position = this.position;
        var axis = this.axis;
        var transform = this.transform;

        if (axis !== undefined) {
            if (axis & ~Particle.AXES.X) {
                position.x = 0;
            }
            if (axis & ~Particle.AXES.Y) {
                position.y = 0;
            }
            if (axis & ~Particle.AXES.Z) {
                position.z = 0;
            }
        }

        transform[12] = position.x;
        transform[13] = position.y;
        transform[14] = position.z;

        return transform;
    };

    /**
     * The modify interface of a Modifier
     * @method modify
     * @param target {Spec}
     * @return Spec {Spec}
     */
    Particle.prototype.modify = function modify(target) {
        var _spec = this._spec;
        _spec.transform = this.getTransform();
        _spec.target = target;
        return _spec;
    };

    // private
    function _createEventOutput() {
        this._eventOutput = new EventHandler();
        this._eventOutput.bindThis(this);
        //overrides on/removeListener/pipe/unpipe methods
        EventHandler.setOutputHandler(this, this._eventOutput);
    }

    Particle.prototype.emit = function emit(type, data) {
        if (!this._eventOutput) return;
        this._eventOutput.emit(type, data);
    };

    Particle.prototype.on = function on() {
        _createEventOutput.call(this);
        return this.on.apply(this, arguments);
    };
    Particle.prototype.removeListener = function removeListener() {
        _createEventOutput.call(this);
        return this.removeListener.apply(this, arguments);
    };
    Particle.prototype.pipe = function pipe() {
        _createEventOutput.call(this);
        return this.pipe.apply(this, arguments);
    };
    Particle.prototype.unpipe = function unpipe() {
        _createEventOutput.call(this);
        return this.unpipe.apply(this, arguments);
    };

    module.exports = Particle;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/physics/forces/Force',['require','exports','module','famous/math/Vector','famous/core/EventHandler'],function(require, exports, module) {
    var Vector = require('famous/math/Vector');
    var EventHandler = require('famous/core/EventHandler');

    /**
     * Force base class.
     *
     * @class Force
     * @uses EventHandler
     * @constructor
     */
    function Force(force) {
        this.force = new Vector(force);
        this._energy = 0.0;
        this._eventOutput = null;
    }

    /**
     * Basic setter for options
     *
     * @method setOptions
     * @param options {Objects}
     */
    Force.prototype.setOptions = function setOptions(options) {
        for (var key in options) this.options[key] = options[key];
    };

    /**
     * Adds a force to a physics body's force accumulator.
     *
     * @method applyForce
     * @param body {Body}
     */
    Force.prototype.applyForce = function applyForce(body) {
        body.applyForce(this.force);
    };

    /**
     * Getter for a force's potential energy.
     *
     * @method getEnergy
     * @return energy {Number}
     */
    Force.prototype.getEnergy = function getEnergy() {
        return this._energy;
    };

    /*
     * Setter for a force's potential energy.
     *
     * @method setEnergy
     * @param energy {Number}
     */
    Force.prototype.setEnergy = function setEnergy(energy) {
        this._energy = energy;
    };

    function _createEventOutput() {
        this._eventOutput = new EventHandler();
        this._eventOutput.bindThis(this);
        EventHandler.setOutputHandler(this, this._eventOutput);
    }

    Force.prototype.on = function on() {
        _createEventOutput.call(this);
        return this.on.apply(this, arguments);
    };
    Force.prototype.addListener = function addListener() {
        _createEventOutput.call(this);
        return this.addListener.apply(this, arguments);
    };
    Force.prototype.pipe = function pipe() {
        _createEventOutput.call(this);
        return this.pipe.apply(this, arguments);
    };
    Force.prototype.removeListener = function removeListener() {
        return this.removeListener.apply(this, arguments);
    };
    Force.prototype.unpipe = function unpipe() {
        return this.unpipe.apply(this, arguments);
    };

    module.exports = Force;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/physics/forces/Drag',['require','exports','module','./Force'],function(require, exports, module) {
    var Force = require('./Force');

    /**
     * Drag is a force that opposes velocity. Attach it to the physics engine
     * to slow down a physics body in motion.
     *
     * @class Drag
     * @constructor
     * @extends Force
     * @param {Object} options options to set on drag
     */
    function Drag(options) {
        this.options = Object.create(this.constructor.DEFAULT_OPTIONS);
        if (options) this.setOptions(options);

        Force.call(this);
    }

    Drag.prototype = Object.create(Force.prototype);
    Drag.prototype.constructor = Drag;

    /**
     * @property Drag.FORCE_FUNCTIONS
     * @type Object
     * @protected
     * @static
     */
    Drag.FORCE_FUNCTIONS = {

        /**
         * A drag force proportional to the velocity
         * @attribute LINEAR
         * @type Function
         * @param {Vector} velocity
         * @return {Vector} drag force
         */
        LINEAR : function(velocity) {
            return velocity;
        },

        /**
         * A drag force proportional to the square of the velocity
         * @attribute QUADRATIC
         * @type Function
         * @param {Vector} velocity
         * @return {Vector} drag force
         */
        QUADRATIC : function(velocity) {
            return velocity.mult(velocity.norm());
        }
    };

    /**
     * @property Drag.DEFAULT_OPTIONS
     * @type Object
     * @protected
     * @static
     */
    Drag.DEFAULT_OPTIONS = {

        /**
         * The strength of the force
         *    Range : [0, 0.1]
         * @attribute strength
         * @type Number
         * @default 0.01
         */
        strength : 0.01,

        /**
         * The type of opposing force
         * @attribute forceFunction
         * @type Function
         */
        forceFunction : Drag.FORCE_FUNCTIONS.LINEAR
    };

    /**
     * Adds a drag force to a physics body's force accumulator.
     *
     * @method applyForce
     * @param targets {Array.Body} Array of bodies to apply drag force to.
     */
    Drag.prototype.applyForce = function applyForce(targets) {
        var strength        = this.options.strength;
        var forceFunction   = this.options.forceFunction;
        var force           = this.force;
        for (var index = 0; index < targets.length; index++) {
            var particle = targets[index];
            forceFunction(particle.velocity).mult(-strength).put(force);
            particle.applyForce(force);
        }
    };

    /**
     * Basic options setter
     *
     * @method setOptions
     * @param {Objects} options
     */
    Drag.prototype.setOptions = function setOptions(options) {
        for (var key in options) this.options[key] = options[key];
    };

    module.exports = Drag;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: david@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/physics/forces/Spring',['require','exports','module','./Force','famous/math/Vector'],function(require, exports, module) {
    var Force = require('./Force');
    var Vector = require('famous/math/Vector');

    /**
     *  A force that moves a physics body to a location with a spring motion.
     *    The body can be moved to another physics body, or an anchor point.
     *
     *  @class Spring
     *  @constructor
     *  @extends Force
     *  @param {Object} options options to set on drag
     */
    function Spring(options) {
        this.options = Object.create(this.constructor.DEFAULT_OPTIONS);
        if (options) this.setOptions(options);

        //registers
        this.disp = new Vector(0,0,0);

        _init.call(this);
        Force.call(this);
    }

    Spring.prototype = Object.create(Force.prototype);
    Spring.prototype.constructor = Spring;

    /** @const */ var pi = Math.PI;

    /**
     * @property Spring.FORCE_FUNCTIONS
     * @type Object
     * @protected
     * @static
     */
    Spring.FORCE_FUNCTIONS = {

        /**
         * A FENE (Finitely Extensible Nonlinear Elastic) spring force
         *      see: http://en.wikipedia.org/wiki/FENE
         * @attribute FENE
         * @type Function
         * @param {Number} dist current distance target is from source body
         * @param {Number} rMax maximum range of influence
         * @return {Number} unscaled force
         */
        FENE : function(dist, rMax) {
            var rMaxSmall = rMax * .99;
            var r = Math.max(Math.min(dist, rMaxSmall), -rMaxSmall);
            return r / (1 - r * r/(rMax * rMax));
        },

        /**
         * A Hookean spring force, linear in the displacement
         *      see: http://en.wikipedia.org/wiki/FENE
         * @attribute FENE
         * @type Function
         * @param {Number} dist current distance target is from source body
         * @return {Number} unscaled force
         */
        HOOK : function(dist) {
            return dist;
        }
    };

    /**
     * @property Spring.DEFAULT_OPTIONS
     * @type Object
     * @protected
     * @static
     */
    Spring.DEFAULT_OPTIONS = {

        /**
         * The amount of time in milliseconds taken for one complete oscillation
         * when there is no damping
         *    Range : [150, Infinity]
         * @attribute period
         * @type Number
         * @default 300
         */
        period        : 300,

        /**
         * The damping of the spring.
         *    Range : [0, 1]
         *    0 = no damping, and the spring will oscillate forever
         *    1 = critically damped (the spring will never oscillate)
         * @attribute dampingRatio
         * @type Number
         * @default 0.1
         */
        dampingRatio : 0.1,

        /**
         * The rest length of the spring
         *    Range : [0, Infinity]
         * @attribute length
         * @type Number
         * @default 0
         */
        length : 0,

        /**
         * The maximum length of the spring (for a FENE spring)
         *    Range : [0, Infinity]
         * @attribute length
         * @type Number
         * @default Infinity
         */
        maxLength : Infinity,

        /**
         * The location of the spring's anchor, if not another physics body
         *
         * @attribute anchor
         * @type Array
         * @optional
         */
        anchor : undefined,

        /**
         * The type of spring force
         * @attribute forceFunction
         * @type Function
         */
        forceFunction : Spring.FORCE_FUNCTIONS.HOOK
    };

    function _setForceFunction(fn) {
        this.forceFunction = fn;
    }

    function _calcStiffness() {
        var options = this.options;
        options.stiffness = Math.pow(2 * pi / options.period, 2);
    }

    function _calcDamping() {
        var options = this.options;
        options.damping = 4 * pi * options.dampingRatio / options.period;
    }

    function _calcEnergy(strength, dist) {
        return 0.5 * strength * dist * dist;
    }

    function _init() {
        _setForceFunction.call(this, this.options.forceFunction);
        _calcStiffness.call(this);
        _calcDamping.call(this);
    }

    /**
     * Basic options setter
     *
     * @method setOptions
     * @param options {Objects}
     */
    Spring.prototype.setOptions = function setOptions(options) {
        if (options.anchor !== undefined) {
            if (options.anchor.position instanceof Vector) this.options.anchor = options.anchor.position;
            if (options.anchor   instanceof Vector)  this.options.anchor = options.anchor;
            if (options.anchor   instanceof Array)  this.options.anchor = new Vector(options.anchor);
        }
        if (options.period !== undefined) this.options.period = options.period;
        if (options.dampingRatio !== undefined) this.options.dampingRatio = options.dampingRatio;
        if (options.length !== undefined) this.options.length = options.length;
        if (options.forceFunction !== undefined) this.options.forceFunction = options.forceFunction;
        if (options.maxLength !== undefined) this.options.maxLength = options.maxLength;

        _init.call(this);
    };

    /**
     * Adds a spring force to a physics body's force accumulator.
     *
     * @method applyForce
     * @param targets {Array.Body} Array of bodies to apply force to.
     */
    Spring.prototype.applyForce = function applyForce(targets, source) {
        var force        = this.force;
        var disp         = this.disp;
        var options      = this.options;

        var stiffness    = options.stiffness;
        var damping      = options.damping;
        var restLength   = options.length;
        var lMax         = options.maxLength;
        var anchor       = options.anchor || source.position;

        for (var i = 0; i < targets.length; i++) {
            var target = targets[i];
            var p2 = target.position;
            var v2 = target.velocity;

            anchor.sub(p2).put(disp);
            var dist = disp.norm() - restLength;

            if (dist === 0) return;

            //if dampingRatio specified, then override strength and damping
            var m      = target.mass;
            stiffness *= m;
            damping   *= m;

            disp.normalize(stiffness * this.forceFunction(dist, lMax))
                .put(force);

            if (damping)
                if (source) force.add(v2.sub(source.velocity).mult(-damping)).put(force);
                else        force.add(v2.mult(-damping)).put(force);

            target.applyForce(force);
            if (source) source.applyForce(force.mult(-1));

            this.setEnergy(_calcEnergy(stiffness, dist));
        }
    };

    /**
     * Calculates the potential energy of the spring.
     *
     * @method getEnergy
     * @param target {Body}     The physics body attached to the spring
     * @return energy {Number}
     */
    Spring.prototype.getEnergy = function getEnergy(target) {
        var options        = this.options;
        var restLength  = options.length;
        var anchor      = options.anchor;
        var strength    = options.stiffness;

        var dist = anchor.sub(target.position).norm() - restLength;
        return 0.5 * strength * dist * dist;
    };

    /**
     * Sets the anchor to a new position
     *
     * @method setAnchor
     * @param anchor {Array}    New anchor of the spring
     */
    Spring.prototype.setAnchor = function setAnchor(anchor) {
        if (!this.options.anchor) this.options.anchor = new Vector();
        this.options.anchor.set(anchor);
    };

    module.exports = Spring;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/inputs/TouchTracker',['require','exports','module','famous/core/EventHandler'],function(require, exports, module) {
    var EventHandler = require('famous/core/EventHandler');

    function _timestampTouch(touch, origin, history, count) {
        var touchClone = {};
        for (var i in touch) touchClone[i] = touch[i];
        return {
            touch: touchClone,
            origin: origin,
            timestamp: Date.now(),
            count: count,
            history: history
        };
    }

    function _handleStart(event) {
        for (var i = 0; i < event.changedTouches.length; i++) {
            var touch = event.changedTouches[i];
            var data = _timestampTouch(touch, event.origin, undefined, event.touches.length);
            this.eventOutput.emit('trackstart', data);
            if (!this.selective && !this.touchHistory[touch.identifier]) this.track(data);
        }
    }

    function _handleMove(event) {
        for (var i = 0; i < event.changedTouches.length; i++) {
            var touch = event.changedTouches[i];
            var history = this.touchHistory[touch.identifier];
            if (history) {
                var data = _timestampTouch(touch, event.origin, history, event.touches.length);
                this.touchHistory[touch.identifier].push(data);
                this.eventOutput.emit('trackmove', data);
            }
        }
    }

    function _handleEnd(event) {
        for (var i = 0; i < event.changedTouches.length; i++) {
            var touch = event.changedTouches[i];
            var history = this.touchHistory[touch.identifier];
            if (history) {
                var data = _timestampTouch(touch, event.origin, history, event.touches.length);
                this.eventOutput.emit('trackend', data);
                delete this.touchHistory[touch.identifier];
            }
        }
    }

    function _handleUnpipe() {
        for (var i in this.touchHistory) {
            var history = this.touchHistory[i];
            this.eventOutput.emit('trackend', {
                touch: history[history.length - 1].touch,
                timestamp: Date.now(),
                count: 0,
                history: history
            });
            delete this.touchHistory[i];
        }
    }

    /**
     * Helper to TouchSync – tracks piped in touch events, organizes touch
     *   events by ID, and emits track events back to TouchSync.
     *   Emits 'trackstart', 'trackmove', and 'trackend' events upstream.
     *
     * @class TouchTracker
     * @constructor
     * @param {Boolean} selective if false, save state for each touch.
     */
    function TouchTracker(selective) {
        this.selective = selective;
        this.touchHistory = {};
        this.eventInput = new EventHandler();
        this.eventOutput = new EventHandler();
        EventHandler.setInputHandler(this, this.eventInput);
        EventHandler.setOutputHandler(this, this.eventOutput);

        this.eventInput.on('touchstart', _handleStart.bind(this));
        this.eventInput.on('touchmove', _handleMove.bind(this));
        this.eventInput.on('touchend', _handleEnd.bind(this));
        this.eventInput.on('touchcancel', _handleEnd.bind(this));
        this.eventInput.on('unpipe', _handleUnpipe.bind(this));
    }

    /**
     * Record touch data, if selective is false.
     * @private
     * @method track
     * @param {Object} data touch data
     */
    TouchTracker.prototype.track = function track(data) {
        this.touchHistory[data.touch.identifier] = [data];
    };

    module.exports = TouchTracker;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/inputs/TouchSync',['require','exports','module','./TouchTracker','famous/core/EventHandler'],function(require, exports, module) {
    var TouchTracker = require('./TouchTracker');
    var EventHandler = require('famous/core/EventHandler');

    /**
     * Handles piped in touch events. Emits 'start', 'update', and 'events'
     *   events with position, velocity, acceleration, and touch id.
     *   Useful for dealing with inputs on touch devices.
     *
     *
     * @class TouchSync
     * @constructor
     * @param {function} legacyGetter position getter function (deprecated)
     * @param {Object} options default options overrides
     */
    function TouchSync(legacyGetter, options) {
        if (arguments.length === 2){
            this._legacyPositionGetter = arguments[0];
            options = arguments[1];
        }
        else {
            this._legacyPositionGetter = null;
            options = arguments[0];
        }

        this.output = new EventHandler();
        this.touchTracker = new TouchTracker();

        this.options = {
            direction: undefined,
            rails: false,
            scale: 1
        };

        this._payload = {
            delta    : null,
            position : null,
            velocity : null,
            clientX  : undefined,
            clientY  : undefined,
            count    : 0,
            touch    : undefined
        };

        if (options) this.setOptions(options);
        else this.setOptions(this.options);

        EventHandler.setOutputHandler(this, this.output);
        EventHandler.setInputHandler(this, this.touchTracker);

        this.touchTracker.on('trackstart', _handleStart.bind(this));
        this.touchTracker.on('trackmove', _handleMove.bind(this));
        this.touchTracker.on('trackend', _handleEnd.bind(this));
    }

    TouchSync.DIRECTION_X = 0;
    TouchSync.DIRECTION_Y = 1;

    function _clearPayload() {
        var payload = this._payload;
        payload.position = null;
        payload.velocity = null;
        payload.clientX  = undefined;
        payload.clientY  = undefined;
        payload.count    = undefined;
        payload.touch    = undefined;
    }

    // handle 'trackstart'
    function _handleStart(data) {
        _clearPayload.call(this);

        var payload = this._payload;
        payload.count = data.count;
        payload.touch = data.identifier;

        this.output.emit('start', payload);
    }

    // handle 'trackmove'
    function _handleMove(data) {
        var history = data.history;
        var prevTime = history[history.length - 2].timestamp;
        var currTime = history[history.length - 1].timestamp;
        var prevTouch = history[history.length - 2].touch;
        var currTouch = history[history.length - 1].touch;

        var diffX = currTouch.pageX - prevTouch.pageX;
        var diffY = currTouch.pageY - prevTouch.pageY;

        if (this.options.rails) {
            if (Math.abs(diffX) > Math.abs(diffY)) diffY = 0;
            else diffX = 0;
        }

        var diffTime = Math.max(currTime - prevTime, 8); // minimum tick time

        var velX = diffX / diffTime;
        var velY = diffY / diffTime;

        var scale = this.options.scale;
        var prevPos;
        var nextPos;
        var nextVel;
        var nextDelta;

        if (this.options.direction === TouchSync.DIRECTION_X) {
            prevPos = this._legacyPositionGetter ? this._legacyPositionGetter() : 0;
            nextDelta = scale * diffX;
            nextPos = prevPos + nextDelta;
            nextVel = scale * velX;
        }
        else if (this.options.direction === TouchSync.DIRECTION_Y) {
            prevPos = this._legacyPositionGetter ? this._legacyPositionGetter() : 0;
            nextDelta = scale * diffY;
            nextPos = prevPos + nextDelta;
            nextVel = scale * velY;
        }
        else {
            prevPos = this._legacyPositionGetter ? this._legacyPositionGetter() : [0,0];
            nextDelta = [scale * diffX, scale * diffY];
            nextPos = [prevPos[0] + nextDelta[0], prevPos[1] + nextDelta[1]];
            nextVel = [scale * velX, scale * velY];
        }

        var payload = this._payload;
        payload.delta    = nextDelta;
        payload.position = nextPos;
        payload.velocity = nextVel;
        payload.clientX  = data.touch.clientX;
        payload.clientY  = data.touch.clientY;
        payload.count    = data.count;
        payload.touch    = data.touch.identifier;

        this.output.emit('update', payload);
    }

    // handle 'trackend'
    function _handleEnd(data) {
        var nextVel = (this.options.direction !== undefined) ? 0 : [0, 0];
        var history = data.history;
        var count = data.count;
        if (history.length > 1) {
            var prevTime = history[history.length - 2].timestamp;
            var currTime = history[history.length - 1].timestamp;
            var prevTouch = history[history.length - 2].touch;
            var currTouch = history[history.length - 1].touch;
            var diffX = currTouch.pageX - prevTouch.pageX;
            var diffY = currTouch.pageY - prevTouch.pageY;

            if (this.options.rails) {
                if (Math.abs(diffX) > Math.abs(diffY)) diffY = 0;
                else diffX = 0;
            }

            var diffTime = Math.max(currTime - prevTime, 1); // minimum tick time
            var velX = diffX / diffTime;
            var velY = diffY / diffTime;
            var scale = this.options.scale;

            if (this.options.direction === TouchSync.DIRECTION_X) nextVel = scale * velX;
            else if (this.options.direction === TouchSync.DIRECTION_Y) nextVel = scale * velY;
            else nextVel = [scale * velX, scale * velY];
        }

        var payload = this._payload;
        payload.velocity = nextVel;
        payload.clientX  = data.clientX;
        payload.clientY  = data.clientY;
        payload.count    = count;
        payload.touch    = data.touch.identifier;

        this.output.emit('end', payload);
    }

    /**
     * Set internal options, overriding any default options
     *
     * @method setOptions
     *
     * @param {Object} [options] overrides of default options
     * @param {Number} [options.rails] whether to constrain to nearest axis.
     * @param {Number} [options.direction] TouchSync.DIRECTION_X, DIRECTION_Y -
     *    pay attention to one specific direction.
     * @param {Number} [options.scale] constant factor to scale velocity output
     */
    TouchSync.prototype.setOptions = function setOptions(options) {
        if (options.direction !== undefined) this.options.direction = options.direction;
        if (options.rails !== undefined) this.options.rails = options.rails;
        if (options.scale !== undefined) this.options.scale = options.scale;
    };

    /**
     * Return entire options dictionary, including defaults.
     *
     * @method getOptions
     * @return {Object} configuration options
     */
    TouchSync.prototype.getOptions = function getOptions() {
        return this.options;
    };

    module.exports = TouchSync;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/inputs/ScrollSync',['require','exports','module','famous/core/EventHandler','famous/core/Engine'],function(require, exports, module) {

    var EventHandler = require('famous/core/EventHandler');
    var Engine = require('famous/core/Engine');

    /**
     * Handles piped in mousewheel events.
     *   Emits 'start', 'update', and 'end' events with payloads including:
     *   delta: change since last position,
     *   position: accumulated deltas,
     *   velocity: speed of change in pixels per ms,
     *   slip: true (unused).
     *
     *   Can be used as delegate of GenericSync.
     *
     * @class ScrollSync
     * @constructor
     * @param {function} legacyGetter position getter function (deprecated)
     * @param {Object} [options] overrides of default options
     * @param {Number} [options.direction] Pay attention to x changes (ScrollSync.DIRECTION_X),
     *   y changes (ScrollSync.DIRECTION_Y) or both (undefined)
     * @param {Number} [options.minimumEndSpeed] End speed calculation floors at this number, in pixels per ms
     * @param {boolean} [options.rails] whether to snap position calculations to nearest axis
     * @param {Number | Array.Number} [options.scale] scale outputs in by scalar or pair of scalars
     * @param {Number} [options.stallTime] reset time for velocity calculation in ms
     */
    function ScrollSync(legacyGetter, options) {
        if (arguments.length === 2){
            this._legacyPositionGetter = arguments[0];
            options = arguments[1];
        }
        else {
            this._legacyPositionGetter = null;
            options = arguments[0];
        }

        this.options = {
            direction: undefined,
            minimumEndSpeed: Infinity,
            rails: false,
            scale: 1,
            stallTime: 50,
            lineHeight: 40
        };

        if (options) this.setOptions(options);
        else this.setOptions(this.options);

        this._payload = {
            delta    : null,
            position : null,
            velocity : null,
            slip     : true
        };

        this.input = new EventHandler();
        this.output = new EventHandler();

        EventHandler.setInputHandler(this, this.input);
        EventHandler.setOutputHandler(this, this.output);

        this._prevTime = undefined;
        this._prevVel = undefined;
        this.input.on('mousewheel', _handleMove.bind(this));
        this.input.on('wheel', _handleMove.bind(this));
        this.inProgress = false;

        this._loopBound = false;
    }

    ScrollSync.DIRECTION_X = 0;
    ScrollSync.DIRECTION_Y = 1;

    function _newFrame() {
        var now = Date.now();
        if (this.inProgress && now - this._prevTime > this.options.stallTime) {
            var pos = (this.options.direction === undefined)
                ? this._legacyPositionGetter ? this._legacyPositionGetter : [0,0]
                : this._legacyPositionGetter ? this._legacyPositionGetter : 0;

            this.inProgress = false;
            var finalVel = 0;

            if (Math.abs(this._prevVel) >= this.options.minimumEndSpeed) finalVel = this._prevVel;

            var payload = this._payload;
            payload.position = pos;
            payload.velocity = finalVel;
            payload.slip = true;

            this.output.emit('end', payload);
        }
    }

    function _handleMove(event) {
        event.preventDefault();
        if (!this.inProgress) {
            this.inProgress = true;
            this.output.emit('start', {slip: true});
            if (!this._loopBound) {
                Engine.on('prerender', _newFrame.bind(this));
                this._loopBound = true;
            }
        }

        var prevTime = this._prevTime || Date.now();
        var diffX = (event.wheelDeltaX !== undefined) ? event.wheelDeltaX : -event.deltaX;
        var diffY = (event.wheelDeltaY !== undefined) ? event.wheelDeltaY : -event.deltaY;

        if (event.deltaMode === 1) { // units in lines, not pixels
            diffX *= this.options.lineHeight;
            diffY *= this.options.lineHeight;
        }

        var currTime = Date.now();

        if (this.options.rails) {
            if (Math.abs(diffX) > Math.abs(diffY)) diffY = 0;
            else diffX = 0;
        }

        var diffTime = Math.max(currTime - prevTime, 8); // minimum tick time

        var velX = diffX / diffTime;
        var velY = diffY / diffTime;

        var prevPos;
        var scale = this.options.scale;
        var nextPos;
        var nextVel;
        var nextDelta;

        if (this.options.direction === ScrollSync.DIRECTION_X) {
            prevPos = this._legacyPositionGetter ? this._legacyPositionGetter() : 0;
            nextDelta = scale * diffX;
            nextPos = prevPos + nextDelta;
            nextVel = scale * velX;
        }
        else if (this.options.direction === ScrollSync.DIRECTION_Y) {
            prevPos = this._legacyPositionGetter ? this._legacyPositionGetter() : 0;
            nextDelta = scale * diffY;
            nextPos = prevPos + nextDelta;
            nextVel = scale * velY;
        }
        else {
            prevPos = this._legacyPositionGetter ? this._legacyPositionGetter() : [0,0];
            nextDelta = [scale * diffX, scale * diffY];
            nextPos = [prevPos[0] + nextDelta[0], prevPos[1] + nextDelta[1]];
            nextVel = [scale * velX, scale * velY];
        }

        var payload = this._payload;
        payload.delta    = nextDelta;
        payload.position = nextPos;
        payload.velocity = nextVel;
        payload.slip     = true;

        this.output.emit('update', payload);

        this._prevTime = currTime;
        this._prevVel = nextVel;
    }

    /**
     * Return entire options dictionary, including defaults.
     *
     * @method getOptions
     * @return {Object} configuration options
     */
    ScrollSync.prototype.getOptions = function getOptions() {
        return this.options;
    };

    /**
     * Set internal options, overriding any default options
     *
     * @method setOptions
     *
     * @param {Object} [options] overrides of default options
     * @param {Number} [options.minimimEndSpeed] If final velocity smaller than this, round down to 0.
     * @param {Number} [options.stallTime] ms of non-motion before 'end' emitted
     * @param {Number} [options.rails] whether to constrain to nearest axis.
     * @param {Number} [options.direction] ScrollSync.DIRECTION_X, DIRECTION_Y -
     *    pay attention to one specific direction.
     * @param {Number} [options.scale] constant factor to scale velocity output
     */
    ScrollSync.prototype.setOptions = function setOptions(options) {
        if (options.direction !== undefined) this.options.direction = options.direction;
        if (options.minimumEndSpeed !== undefined) this.options.minimumEndSpeed = options.minimumEndSpeed;
        if (options.rails !== undefined) this.options.rails = options.rails;
        if (options.scale !== undefined) this.options.scale = options.scale;
        if (options.stallTime !== undefined) this.options.stallTime = options.stallTime;
    };

    module.exports = ScrollSync;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/inputs/GenericSync',['require','exports','module','famous/core/EventHandler','./TouchSync','./ScrollSync'],function(require, exports, module) {
    var EventHandler = require('famous/core/EventHandler');
    var TouchSync = require('./TouchSync');
    var ScrollSync = require('./ScrollSync');

    var defaultClasses = [TouchSync, ScrollSync];

    /**
     * Combines multiple types of event handling (e.g. touch, trackpad
     *     scrolling) into one standardized interface for inclusion in
     *     widgets. TouchSync and ScrollSync are enabled by default.
     *     Emits 'start', 'update', and 'end' events as a union
     *     of the input sync providers.
     * @class GenericSync
     * @constructor
     * @param {function} legacyGetter position getter function object (Deprecated)
     * @param {Object} [options] default options overrides, passed to all sync classes
     * @param {Array.Object} [options.syncClasses] array of classes in inputs/ which
     *   will feed input to GenericSync.
     */
    function GenericSync(legacyGetter, options) {
        if (arguments.length === 2){
            this._legacyPositionGetter = legacyGetter;
        }
        else {
            this._legacyPositionGetter = null;
            options = legacyGetter;
        }

        this.eventInput = new EventHandler();
        this.eventOutput = new EventHandler();

        EventHandler.setInputHandler(this, this.eventInput);
        EventHandler.setOutputHandler(this, this.eventOutput);

        this._handlers = undefined;

        if (options) {
            this.options = options;
            if (!options.syncClasses) this.options.syncClasses = defaultClasses;
            this.setOptions(options);
        }
        else this.options = {syncClasses : defaultClasses};

        if (this._handlers) _updateHandlers.call(this);
    }

    /**
     * Add another sync type to the sources for this class
     *
     * @static
     * @method register
     *
     * @param {Object} syncClass class to add to GenericSync's inputs.
     */
    GenericSync.register = function register(syncClass) {
        if (defaultClasses.indexOf(syncClass) < 0) defaultClasses.push(syncClass);
    };

    GenericSync.DIRECTION_X = 0;
    GenericSync.DIRECTION_Y = 1;
    GenericSync.DIRECTION_Z = 2;

    function _updateHandlers() {
        var SyncClass = null;
        var i = 0;
        if (this._handlers) {
            for (i = 0; i < this._handlers.length; i++) {
                this.eventInput.unpipe(this._handlers[i]);
                this._handlers[i].unpipe(this.eventOutput);
            }
        }
        this._handlers = [];

        for (i = 0; i < this.options.syncClasses.length; i++) {
            SyncClass = this.options.syncClasses[i];
            this._handlers[i] = new SyncClass(this._legacyPositionGetter, this._handlerOptions);
            this.eventInput.pipe(this._handlers[i]);
            this._handlers[i].pipe(this.eventOutput);
        }
    }

    /**
     * Set internal options, overriding any default options.
     *   Note that these options will be passed to every class added
     *   to 'syncClasses'
     * @method setOptions
     *
     * @param {Object} [options] overrides of default options
     * @param {Array.Object} [options.syncClasses] array of classes in inputs/ which
     *   will feed input to GenericSync.
     */
    GenericSync.prototype.setOptions = function setOptions(options) {
        this._handlerOptions = options;
        if (options.syncClasses) {
            this.options.syncClasses = options.syncClasses;
            _updateHandlers.call(this);
        }
        if (this._handlers) {
            for (var i = 0; i < this._handlers.length; i++) {
                this._handlers[i].setOptions(this._handlerOptions);
            }
        }
    };

    module.exports = GenericSync;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/core/Group',['require','exports','module','./Context','./Transform','./Surface'],function(require, exports, module) {
    var Context = require('./Context');
    var Transform = require('./Transform');
    var Surface = require('./Surface');

    /**
     * A Context designed to contain surfaces and set properties
     *   to be applied to all of them at once.
     *   This is primarily used for specific performance improvements in the rendering engine.
     *   Private.
     *
     * @private
     * @class Group
     * @extends Surface
     * @constructor
     * @param {Object} [options] Surface options array (see Surface})
     */
    function Group(options) {
        Surface.call(this, options);
        this._shouldRecalculateSize = false;
        this._container = document.createDocumentFragment();
        this.context = new Context(this._container);
        this.setContent(this._container);
        this._groupSize = [undefined, undefined];
    }

    /** @const */
    Group.SIZE_ZERO = [0, 0];

    Group.prototype = Object.create(Surface.prototype);
    Group.prototype.elementType = 'div';
    Group.prototype.elementClass = 'famous-group';

    /**
     * Add renderables to this component's render tree.
     *
     * @method add
     * @private
     * @param {Object} obj renderable object
     * @return {RenderNode} Render wrapping provided object, if not already a RenderNode
     */
    Group.prototype.add = function add() {
        return this.context.add.apply(this.context, arguments);
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {Number} Render spec for this component
     */
    Group.prototype.render = function render() {
        return Surface.prototype.render.call(this);
    };

    /**
     * Place the document element this component manages into the document.
     *
     * @private
     * @method deploy
     * @param {Node} target document parent of this container
     */
    Group.prototype.deploy = function deploy(target) {
        this.context.migrate(target);
    };

    /**
     * Remove this component and contained content from the document
     *
     * @private
     * @method recall
     *
     * @param {Node} target node to which the component was deployed
     */
    Group.prototype.recall = function recall(target) {
        this._container = document.createDocumentFragment();
        this.context.migrate(this._container);
    };

    /**
     * Apply changes from this component to the corresponding document element.
     *
     * @private
     * @method commit
     *
     * @param {Object} context update spec passed in from above in the render tree.
     */
    Group.prototype.commit = function commit(context) {
        var transform = context.transform;
        var origin = context.origin;
        var opacity = context.opacity;
        var size = context.size;
        var result = Surface.prototype.commit.call(this, {
            allocator: context.allocator,
            transform: Transform.thenMove(transform, [-origin[0] * size[0], -origin[1] * size[1], 0]),
            opacity: opacity,
            origin: origin,
            size: Group.SIZE_ZERO
        });
        if (size[0] !== this._groupSize[0] || size[1] !== this._groupSize[1]) {
            this._groupSize[0] = size[0];
            this._groupSize[1] = size[1];
            this.context.setSize(size);
        }
        this.context.update({
            transform: Transform.translate(-origin[0] * size[0], -origin[1] * size[1], 0),
            origin: origin,
            size: size
        });
        return result;
    };

    module.exports = Group;
});

define('famous/views/Scroller',['require','exports','module','famous/core/Entity','famous/core/Group','famous/core/OptionsManager','famous/core/Transform','famous/utilities/Utility','famous/core/ViewSequence','famous/core/EventHandler'],function(require, exports, module) {
    var Entity = require('famous/core/Entity');
    var Group = require('famous/core/Group');
    var OptionsManager = require('famous/core/OptionsManager');
    var Transform = require('famous/core/Transform');
    var Utility = require('famous/utilities/Utility');
    var ViewSequence = require('famous/core/ViewSequence');
    var EventHandler = require('famous/core/EventHandler');

    /**
     * Scroller lays out a collection of renderables, and will browse through them based on 
     * accesed position. Scroller also broadcasts an 'edgeHit' event, with a position property of the location of the edge,
     * when you've hit the 'edges' of it's renderable collection.
     * @class Scroller
     * @constructor
      * @event error
     * @param {Options} [options] An object of configurable options.
     * @param {Number} [options.direction=Utility.Direction.Y] Using the direction helper found in the famous Utility
     * module, this option will lay out the Scroller instance's renderables either horizontally
     * (x) or vertically (y). Utility's direction is essentially either zero (X) or one (Y), so feel free
     * to just use integers as well.
     * @param {Number} [clipSize=undefined] The size of the area (in pixels) that Scroller will display content in.
     * @param {Number} [margin=undefined] The size of the area (in pixels) that Scroller will process renderables' associated calculations in.
     */
    function Scroller(options) {
        this.options = Object.create(this.constructor.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);
        if (options) this._optionsManager.setOptions(options);

        this._node = null;
        this._position = 0;

        // used for shifting nodes
        this._positionOffset = 0;

        this._positionGetter = null;
        this._outputFunction = null;
        this._masterOutputFunction = null;
        this.outputFrom();

        this._onEdge = 0; // -1 for top, 1 for bottom

        this.group = new Group();
        this.group.add({render: _innerRender.bind(this)});

        this._entityId = Entity.register(this);
        this._size = [undefined, undefined];
        this._contextSize = [undefined, undefined];

        this._eventInput = new EventHandler();
        this._eventOutput = new EventHandler();

        EventHandler.setInputHandler(this, this._eventInput);
        EventHandler.setOutputHandler(this, this._eventOutput);
    }

    Scroller.DEFAULT_OPTIONS = {
        direction: Utility.Direction.Y,
        margin: 0,
        clipSize: undefined
    };

    function _sizeForDir(size) {
        if (!size) size = this._contextSize;
        var dimension = (this.options.direction === Utility.Direction.X) ? 0 : 1;
        return (size[dimension] === undefined) ? this._contextSize[dimension] : size[dimension];
    }

    function _output(node, offset, target) {
        var size = node.getSize ? node.getSize() : this._contextSize;
        var transform = this._outputFunction(offset);
        target.push({transform: transform, target: node.render()});
        return _sizeForDir.call(this, size);
    }

    function _getClipSize() {
        if (this.options.clipSize) return this.options.clipSize;
        else return _sizeForDir.call(this, this._contextSize);
    }

    /**
     * Patches the Scroller instance's options with the passed-in ones.
     * @method setOptions
     * @param {Options} options An object of configurable options for the Scroller instance.
     */
    Scroller.prototype.setOptions = function setOptions(options) {
        return this._optionsManager.setOptions(options);
    };

    /**
     * Tells you if the Scroller instance is on an edge.
     * @method onEdge
     * @return {Boolean} Whether the Scroller instance is on an edge or not.
     */
    Scroller.prototype.onEdge = function onEdge() {
        return this._onEdge;
    };

    /**
     * Allows you to overwrite the way Scroller lays out it's renderables. Scroller will
     * pass an offset into the function. By default the Scroller instance just translates each node
     * in it's direction by the passed-in offset.
     * Scroller will translate each renderable down 
     * @method outputFrom
     * @param {Function} fn A function that takes an offset and returns a transform.
     * @param {Function} [masterFn]
     */
    Scroller.prototype.outputFrom = function outputFrom(fn, masterFn) {
        if (!fn) {
            fn = function(offset) {
                return (this.options.direction === Utility.Direction.X) ? Transform.translate(offset, 0) : Transform.translate(0, offset);
            }.bind(this);
            if (!masterFn) masterFn = fn;
        }
        this._outputFunction = fn;
        this._masterOutputFunction = masterFn ? masterFn : function(offset) {
            return Transform.inverse(fn(-offset));
        };
    };

    /**
     * The Scroller instance's method for reading from an external position. Scroller uses
     * the external position to actually scroll through it's renderables.
     * @method positionFrom
     * @param {Getter} position Can be either a function that returns a position,
     * or an object with a get method that returns a position.
     */
    Scroller.prototype.positionFrom = function positionFrom(position) {
        if (position instanceof Function) this._positionGetter = position;
        else if (position && position.get) this._positionGetter = position.get.bind(position);
        else {
            this._positionGetter = null;
            this._position = position;
        }
        if (this._positionGetter) this._position = this._positionGetter.call(this);
    };

    /**
     * Sets the collection of renderables under the Scroller instance's control.
     *
     * @method sequenceFrom
     * @param {Array|ViewSequence} items Either an array of renderables or a Famous viewSequence.
     * @chainable
     */
    Scroller.prototype.sequenceFrom = function sequenceFrom(node) {
        if (node instanceof Array) node = new ViewSequence({array: node});
        this._node = node;
        this._positionOffset = 0;
    };

    /**
     * Returns the width and the height of the Scroller instance.
     *
     * @method getSize
     * @return {Array} A two value array of the Scroller instance's current width and height (in that order).
     */
    Scroller.prototype.getSize = function getSize(actual) {
        return actual ? this._contextSize : this._size;
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    Scroller.prototype.render = function render() {
        if (!this._node) return null;
        if (this._positionGetter) this._position = this._positionGetter.call(this);
        return this._entityId;
    };

    /**
     * Apply changes from this component to the corresponding document element.
     * This includes changes to classes, styles, size, content, opacity, origin,
     * and matrix transforms.
     *
     * @private
     * @method commit
     * @param {Context} context commit context
     */
    Scroller.prototype.commit = function commit(context) {
        var transform = context.transform;
        var opacity = context.opacity;
        var origin = context.origin;
        var size = context.size;

        // reset edge detection on size change
        if (!this.options.clipSize && (size[0] !== this._contextSize[0] || size[1] !== this._contextSize[1])) {
            this._onEdge = 0;
            this._contextSize = size;

            if (this.options.direction === Utility.Direction.X) {
                this._size[0] = _getClipSize.call(this);
                this._size[1] = undefined;
            }
            else {
                this._size[0] = undefined;
                this._size[1] = _getClipSize.call(this);
            }
        }

        var scrollTransform = this._masterOutputFunction(-this._position);

        return {
            transform: Transform.multiply(transform, scrollTransform),
            opacity: opacity,
            origin: origin,
            target: this.group.render()
        };
    };

    function _normalizeState() {
        var nodeSize = _sizeForDir.call(this, this._node.getSize());
        var nextNode = this._node && this._node.getNext ? this._node.getNext() : null;
        while (nextNode && this._position + this._positionOffset >= nodeSize) {
            this._positionOffset -= nodeSize;
            this._node = nextNode;
            nodeSize = _sizeForDir.call(this, this._node.getSize());
            nextNode = this._node && this._node.getNext ? this._node.getNext() : null;
        }
        var prevNode = this._node && this._node.getPrevious ? this._node.getPrevious() : null;
        while (prevNode && this._position + this._positionOffset < 0) {
            var prevNodeSize = _sizeForDir.call(this, prevNode.getSize());
            this._positionOffset += prevNodeSize;
            this._node = prevNode;
            prevNode = this._node && this._node.getPrevious ? this._node.getPrevious() : null;
        }
    }

    function _innerRender() {
        var size = null;
        var position = this._position;
        var result = [];

        this._onEdge = 0;

        var offset = -this._positionOffset;
        var clipSize = _getClipSize.call(this);
        var currNode = this._node;
        while (currNode && offset - position < clipSize + this.options.margin) {
            offset += _output.call(this, currNode, offset, result);
            currNode = currNode.getNext ? currNode.getNext() : null;
        }

        var sizeNode = this._node;
        var nodesSize = _sizeForDir.call(this, sizeNode.getSize());
        if (offset < clipSize) {
            while (sizeNode && nodesSize < clipSize) {
                sizeNode = sizeNode.getPrevious();
                if (sizeNode) nodesSize += _sizeForDir.call(this, sizeNode.getSize());
            }
            sizeNode = this._node;
            while (sizeNode && nodesSize < clipSize) {
                sizeNode = sizeNode.getNext();
                if (sizeNode) nodesSize += _sizeForDir.call(this, sizeNode.getSize());
            }
        }

        var edgeSize = (nodesSize !== undefined && nodesSize < clipSize) ? nodesSize : clipSize;

        if (!currNode && offset - position <= edgeSize) {
            this._onEdge = 1;
            this._eventOutput.emit('edgeHit', {
                position: offset - edgeSize
            });
        }
        else if (!this._node.getPrevious() && position <= 0) {
            this._onEdge = -1;
            this._eventOutput.emit('edgeHit', {
                position: 0
            });
        }

        // backwards
        currNode = (this._node && this._node.getPrevious) ? this._node.getPrevious() : null;
        offset = -this._positionOffset;
        if (currNode) {
            size = currNode.getSize ? currNode.getSize() : this._contextSize;
            offset -= _sizeForDir.call(this, size);
        }

        while (currNode && ((offset - position) > -(_getClipSize.call(this) + this.options.margin))) {
            _output.call(this, currNode, offset, result);
            currNode = currNode.getPrevious ? currNode.getPrevious() : null;
            if (currNode) {
                size = currNode.getSize ? currNode.getSize() : this._contextSize;
                offset -= _sizeForDir.call(this, size);
            }
        }

        _normalizeState.call(this);
        return result;
    }

    module.exports = Scroller;
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: felix@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/views/Scrollview',['require','exports','module','famous/utilities/Utility','famous/physics/PhysicsEngine','famous/physics/bodies/Particle','famous/physics/forces/Drag','famous/physics/forces/Spring','famous/inputs/GenericSync','famous/core/EventHandler','famous/core/OptionsManager','famous/core/ViewSequence','famous/views/Scroller'],function(require, exports, module) {
    var Utility = require('famous/utilities/Utility');

    var PhysicsEngine = require('famous/physics/PhysicsEngine');
    var Particle = require('famous/physics/bodies/Particle');
    var Drag = require('famous/physics/forces/Drag');
    var Spring = require('famous/physics/forces/Spring');

    var GenericSync = require('famous/inputs/GenericSync');
    var EventHandler = require('famous/core/EventHandler');
    var OptionsManager = require('famous/core/OptionsManager');
    var ViewSequence = require('famous/core/ViewSequence');

    var Scroller = require('famous/views/Scroller');

    /**
     * Scrollview will lay out a collection of renderables sequentially in the specified direction, and will
     * allow you to scroll through them with mousewheel or touch events.
     * @class Scrollview
     * @constructor
     * @param {Options} [options] An object of configurable options.
     * @param {Number} [options.direction=Utility.Direction.Y] Using the direction helper found in the famous Utility
     * module, this option will lay out the Scrollview instance's renderables either horizontally
     * (x) or vertically (y). Utility's direction is essentially either zero (X) or one (Y), so feel free
     * to just use integers as well.
     * @param {Boolean} [options.rails=true] When true, Scrollview's genericSync will only process input in it's primary access.
     * @param {Number} [clipSize=undefined] The size of the area (in pixels) that Scrollview will display content in.
     * @param {Number} [margin=undefined] The size of the area (in pixels) that Scrollview will process renderables' associated calculations in.
     * @param {Number} [friction=0.001] Input resistance proportional to the velocity of the input.
     * Controls the feel of the Scrollview instance at low velocities.
     * @param {Number} [drag=0.0001] Input resistance proportional to the square of the velocity of the input.
     * Affects Scrollview instance more prominently at high velocities.
     * @param {Number} [edgeGrip=0.5] A coefficient for resistance against after-touch momentum.
     * @param {Number} [egePeriod=300] Sets the period on the spring that handles the physics associated
     * with hitting the end of a scrollview.
     * @param {Number} [edgeDamp=1] Sets the damping on the spring that handles the physics associated
     * with hitting the end of a scrollview.
     * @param {Boolean} [paginated=false] A paginated scrollview will scroll through items discretely
     * rather than continously.
     * @param {Number} [pagePeriod=500] Sets the period on the spring that handles the physics associated
     * with pagination.
     * @param {Number} [pageDamp=0.8] Sets the damping on the spring that handles the physics associated
     * with pagination.
     * @param {Number} [pageStopSpeed=Infinity] The threshold for determining the amount of velocity
     * required to trigger pagination. The lower the threshold, the easier it is to scroll continuosly.
     * @param {Number} [pageSwitchSpeed=1] The threshold for momentum-based velocity pagination.
     * @param {Number} [speedLimit=10] The highest scrolling speed you can reach.
     */
    function Scrollview(options) {
        this.options = Object.create(Scrollview.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);

        this._node = null;

        this._physicsEngine = new PhysicsEngine();
        this._particle = new Particle();
        this._physicsEngine.addBody(this._particle);

        this.spring = new Spring({anchor: [0, 0, 0]});

        this.drag = new Drag({forceFunction: Drag.FORCE_FUNCTIONS.QUADRATIC});
        this.friction = new Drag({forceFunction: Drag.FORCE_FUNCTIONS.LINEAR});

        this.sync = new GenericSync({direction : this.options.direction});

        this._eventInput = new EventHandler();
        this._eventOutput = new EventHandler();

        this._eventInput.pipe(this.sync);
        this.sync.pipe(this._eventInput);

        EventHandler.setInputHandler(this, this._eventInput);
        EventHandler.setOutputHandler(this, this._eventOutput);

        this._touchCount = 0;
        this._springState = 0;
        this._onEdge = 0; // -1 for top, 1 for bottom
        this._pageSpringPosition = 0;
        this._edgeSpringPosition = 0;
        this._touchVelocity = undefined;
        this._earlyEnd = false;
        this._needsPaginationCheck = false;

        this._scroller = new Scroller();
        this._scroller.positionFrom(this.getPosition.bind(this));

        if (options) this.setOptions(options);

        _bindEvents.call(this);
    }

    /** @const */
    var TOLERANCE = 0.5;

    Scrollview.DEFAULT_OPTIONS = {
        direction: Utility.Direction.Y,
        rails: true,
        friction: 0.001,
        drag: 0.0001,
        edgeGrip: 0.5,
        edgePeriod: 300,
        edgeDamp: 1,
        paginated: false,
        pagePeriod: 500,
        pageDamp: 0.8,
        pageStopSpeed: 10,
        pageSwitchSpeed: 0.5,
        speedLimit: 10
    };

    /** @enum */
    var SpringStates = {
        NONE: 0,
        EDGE: 1,
        PAGE: 2
    };

    function _handleStart(event) {
        this._touchCount = event.count;
        if (event.count === undefined) this._touchCount = 1;

        _detachAgents.call(this);
        this.setVelocity(0);
        this._touchVelocity = 0;
        this._earlyEnd = false;
    }

    function _handleMove(event) {
        var velocity = -event.velocity;
        var delta = -event.delta;

        if (this._onEdge && event.slip) {
            if ((velocity < 0 && this._onEdge < 0) || (velocity > 0 && this._onEdge > 0)) {
                if (!this._earlyEnd) {
                    _handleEnd.call(this, event);
                    this._earlyEnd = true;
                }
            }
            else if (this._earlyEnd && (Math.abs(velocity) > Math.abs(this.getVelocity()))) {
                _handleStart.call(this, event);
            }
        }
        if (this._earlyEnd) return;
        this._touchVelocity = velocity;

        if (event.slip) this.setVelocity(velocity);
        else this.setPosition(this.getPosition() + delta);
    }

    function _handleEnd(event) {
        this._touchCount = event.count || 0;
        if (!this._touchCount) {
            _detachAgents.call(this);
            if (this._onEdge) _setSpring.call(this, this._edgeSpringPosition, SpringStates.EDGE);
            _attachAgents.call(this);
            var velocity = -event.velocity;
            var speedLimit = this.options.speedLimit;
            if (event.slip) speedLimit *= this.options.edgeGrip;
            if (velocity < -speedLimit) velocity = -speedLimit;
            else if (velocity > speedLimit) velocity = speedLimit;
            this.setVelocity(velocity);
            this._touchVelocity = undefined;
            this._needsPaginationCheck = true;
        }
    }

    function _bindEvents() {
        this._eventInput.bindThis(this);
        this._eventInput.on('start', _handleStart);
        this._eventInput.on('update', _handleMove);
        this._eventInput.on('end', _handleEnd);

        this._scroller.on('edgeHit', function(data) {
            this._edgeSpringPosition = data.position;
        }.bind(this));
    }

    function _attachAgents() {
        if (this._springState) this._physicsEngine.attach([this.spring], this._particle);
        else this._physicsEngine.attach([this.drag, this.friction], this._particle);
    }

    function _detachAgents() {
        this._springState = SpringStates.NONE;
        this._physicsEngine.detachAll();
    }

    function _nodeSizeForDirection(node) {
        var direction = this.options.direction;
        var nodeSize = (node.getSize() || this._scroller.getSize())[direction];
        if (!nodeSize) nodeSize = this._scroller.getSize()[direction];
        return nodeSize;
    }

    function _handleEdge(edgeDetected) {
        if (!this._onEdge && edgeDetected) {
            this.sync.setOptions({scale: this.options.edgeGrip});
            if (!this._touchCount && this._springState !== SpringStates.EDGE) {
                _setSpring.call(this, this._edgeSpringPosition, SpringStates.EDGE);
            }
        }
        else if (this._onEdge && !edgeDetected) {
            this.sync.setOptions({scale: 1});
            if (this._springState && Math.abs(this.getVelocity()) < 0.001) {
                // reset agents, detaching the spring
                _detachAgents.call(this);
                _attachAgents.call(this);
            }
        }
        this._onEdge = edgeDetected;
    }

    function _handlePagination() {
        if (!this._needsPaginationCheck) return;

        if (this._touchCount) return;
        if (this._springState === SpringStates.EDGE) return;

        var velocity = this.getVelocity();
        if (Math.abs(velocity) >= this.options.pageStopSpeed) return;

        var position = this.getPosition();
        var velocitySwitch = Math.abs(velocity) > this.options.pageSwitchSpeed;

        // parameters to determine when to switch
        var nodeSize = _nodeSizeForDirection.call(this, this._node);
        var positionNext = position > 0.5 * nodeSize;
        var velocityNext = velocity > 0;

        if ((positionNext && !velocitySwitch) || (velocitySwitch && velocityNext)) this.goToNextPage();
        else _setSpring.call(this, 0, SpringStates.PAGE);

        this._needsPaginationCheck = false;
    }

    function _setSpring(position, springState) {
        var springOptions;
        if (springState === SpringStates.EDGE) {
            this._edgeSpringPosition = position;
            springOptions = {
                anchor: [this._edgeSpringPosition, 0, 0],
                period: this.options.edgePeriod,
                dampingRatio: this.options.edgeDamp
            };
        }
        else if (springState === SpringStates.PAGE) {
            this._pageSpringPosition = position;
            springOptions = {
                anchor: [this._pageSpringPosition, 0, 0],
                period: this.options.pagePeriod,
                dampingRatio: this.options.pageDamp
            };
        }

        this.spring.setOptions(springOptions);
        if (springState && !this._springState) {
            _detachAgents.call(this);
            this._springState = springState;
            _attachAgents.call(this);
        }
        this._springState = springState;
    }

    function _normalizeState() {
        var position = this.getPosition();
        var nodeSize = _nodeSizeForDirection.call(this, this._node);
        var nextNode = this._node.getNext();

        while (position > nodeSize + TOLERANCE && nextNode) {
            _shiftOrigin.call(this, -nodeSize);
            position -= nodeSize;
            this._scroller.sequenceFrom(nextNode);
            this._node = nextNode;
            nextNode = this._node.getNext();
            nodeSize = _nodeSizeForDirection.call(this, this._node);
        }

        var previousNode = this._node.getPrevious();
        var previousNodeSize;

        while (position < -TOLERANCE && previousNode) {
            previousNodeSize = _nodeSizeForDirection.call(this, previousNode);
            this._scroller.sequenceFrom(previousNode);
            this._node = previousNode;
            _shiftOrigin.call(this, previousNodeSize);
            position += previousNodeSize;
            previousNode = this._node.getPrevious();
        }
    }

    function _shiftOrigin(amount) {
        this._edgeSpringPosition += amount;
        this._pageSpringPosition += amount;
        this.setPosition(this.getPosition() + amount);
        if (this._springState === SpringStates.EDGE) {
            this.spring.setOptions({anchor: [this._edgeSpringPosition, 0, 0]});
        }
        else if (this._springState === SpringStates.PAGE) {
            this.spring.setOptions({anchor: [this._pageSpringPosition, 0, 0]});
        }
    }

    Scrollview.prototype.outputFrom = function outputFrom() {
        return this._scroller.outputFrom.apply(this._scroller, arguments);
    };

    /**
     * Returns the position associated with the Scrollview instance's current node
     * (generally the node currently at the top).
     * @method getPosition
     * @param {number} [node] If specified, returns the position of the node at that index in the
     * Scrollview instance's currently managed collection.
     * @return {number} The position of either the specified node, or the Scrollview's current Node,
     * in pixels translated.
     */
    Scrollview.prototype.getPosition = function getPosition() {
        return this._particle.getPosition1D();
    };

    /**
     * Sets position of the physics particle that controls Scrollview instance's "position"
     * @method setPosition
     * @param {number} x The amount of pixels you want your scrollview to progress by.
     */
    Scrollview.prototype.setPosition = function setPosition(x) {
        this._particle.setPosition1D(x);
    };

    /**
     * Returns the Scrollview instance's velocity.
     * @method getVelocity
     * @return {Number} The velocity.
     */

    Scrollview.prototype.getVelocity = function getVelocity() {
        return this._touchCount ? this._touchVelocity : this._particle.getVelocity1D();
    };

    /**
     * Sets the Scrollview instance's velocity. Until affected by input or another call of setVelocity
     * the Scrollview instance will scroll at the passed-in velocity.
     * @method setVelocity
     * @param {number} v TThe magnitude of the velocity.
     */
    Scrollview.prototype.setVelocity = function setVelocity(v) {
        this._particle.setVelocity1D(v);
    };

    /**
     * Patches the Scrollview instance's options with the passed-in ones.
     * @method setOptions
     * @param {Options} options An object of configurable options for the Scrollview instance.
     */
    Scrollview.prototype.setOptions = function setOptions(options) {
        if (options.direction !== undefined) {
            if (options.direction === 'x') options.direction = Utility.Direction.X;
            else if (options.direction === 'y') options.direction = Utility.Direction.Y;
        }
        this._scroller.setOptions(options);
        this._optionsManager.setOptions(options);

        if (this.options.margin === undefined) this.options.margin = 1000; // mostly safe

        this.drag.setOptions({strength: this.options.drag});
        this.friction.setOptions({strength: this.options.friction});

        this.spring.setOptions({
            period: this.options.edgePeriod,
            dampingRatio: this.options.edgeDamp
        });

        this.sync.setOptions({
            rails: this.options.rails,
            direction: (this.options.direction === Utility.Direction.X) ? GenericSync.DIRECTION_X : GenericSync.DIRECTION_Y
        });
    };

    /**
     * goToPreviousPage paginates your Scrollview instance backwards by one item.
     * @method goToPreviousPage
     * @return {ViewSequence} The previous node.
     */
    Scrollview.prototype.goToPreviousPage = function goToPreviousPage() {
        if (!this._node) return null;
        var previousNode = this._node.getPrevious();
        if (previousNode) {
            var currentPosition = this.getPosition();
            var previousNodeSize = _nodeSizeForDirection.call(this, previousNode);
            this._scroller.sequenceFrom(previousNode);
            this._node = previousNode;
            var previousSpringPosition = (currentPosition < TOLERANCE) ? -previousNodeSize : 0;
            _setSpring.call(this, previousSpringPosition, SpringStates.PAGE);
            _shiftOrigin.call(this, previousNodeSize);
        }
        this._eventOutput.emit('pageChange', {direction: -1});
        return previousNode;
    };

    /**
     * goToNextPage paginates your Scrollview instance forwards by one item.
     * @method goToNextPage
     * @return {ViewSequence} The next node.
     */
    Scrollview.prototype.goToNextPage = function goToNextPage() {
        if (!this._node) return null;
        var nextNode = this._node.getNext();
        if (nextNode) {
            var currentPosition = this.getPosition();
            var currentNodeSize = _nodeSizeForDirection.call(this, this._node);
            var nextNodeSize = _nodeSizeForDirection.call(this, nextNode);
            this._scroller.sequenceFrom(nextNode);
            this._node = nextNode;
            var nextSpringPosition = (currentPosition > currentNodeSize - TOLERANCE) ? currentNodeSize + nextNodeSize : currentNodeSize;
            _setSpring.call(this, nextSpringPosition, SpringStates.PAGE);
            _shiftOrigin.call(this, -currentNodeSize);
        }
        this._eventOutput.emit('pageChange', {direction: 1});
        return nextNode;
    };

    /**
     * Sets the collection of renderables under the Scrollview instance's control, by
     * setting its current node to the passed in ViewSequence. If you
     * pass in an array, the Scrollview instance will set its node as a ViewSequence instantiated with
     * the passed-in array.
     *
     * @method sequenceFrom
     * @param {Array|ViewSequence} node Either an array of renderables or a Famous viewSequence.
     */
    Scrollview.prototype.sequenceFrom = function sequenceFrom(node) {
        if (node instanceof Array) node = new ViewSequence({array: node});
        this._node = node;
        return this._scroller.sequenceFrom(node);
    };

    /**
     * Returns the width and the height of the Scrollview instance.
     *
     * @method getSize
     * @return {Array} A two value array of the Scrollview instance's current width and height (in that order).
     */
    Scrollview.prototype.getSize = function getSize() {
        return this._scroller.getSize.apply(this._scroller, arguments);
    };

    /**
     * Generate a render spec from the contents of this component.
     *
     * @private
     * @method render
     * @return {number} Render spec for this component
     */
    Scrollview.prototype.render = function render() {
        if (!this._node) return null;

        _normalizeState.call(this);
        _handleEdge.call(this, this._scroller.onEdge());
        if (this.options.paginated) _handlePagination.call(this);

        return this._scroller.render();
    };

    module.exports = Scrollview;
});


/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Owner: mark@famo.us
 * @license MPL 2.0
 * @copyright Famous Industries, Inc. 2014
 */

define('famous/surfaces/ImageSurface',['require','exports','module','famous/core/Surface'],function(require, exports, module) {
    var Surface = require('famous/core/Surface');

    /**
     * A surface containing image content.
     *   This extends the Surface class.
     *
     * @class ImageSurface
     *
     * @extends Surface
     * @constructor
     * @param {Object} [options] overrides of default options
     */
    function ImageSurface(options) {
        this._imageUrl = undefined;
        Surface.apply(this, arguments);
    }

    ImageSurface.prototype = Object.create(Surface.prototype);
    ImageSurface.prototype.constructor = ImageSurface;
    ImageSurface.prototype.elementType = 'img';
    ImageSurface.prototype.elementClass = 'famous-surface';

    /**
     * Set content URL.  This will cause a re-rendering.
     * @method setContent
     * @param {string} imageUrl
     */
    ImageSurface.prototype.setContent = function setContent(imageUrl) {
        this._imageUrl = imageUrl;
        this._contentDirty = true;
    };

    /**
     * Place the document element that this component manages into the document.
     *
     * @private
     * @method deploy
     * @param {Node} target document parent of this container
     */
    ImageSurface.prototype.deploy = function deploy(target) {
        target.src = this._imageUrl || '';
    };

    /**
     * Remove this component and contained content from the document
     *
     * @private
     * @method recall
     *
     * @param {Node} target node to which the component was deployed
     */
    ImageSurface.prototype.recall = function recall(target) {
        target.src = '';
    };

    module.exports = ImageSurface;
});

define('widgets/BookGrid',['require','exports','module','famous/core/View','famous/core/Modifier','famous/core/Surface','famous/views/Scrollview','famous/surfaces/ContainerSurface','famous/views/SequentialLayout','famous/surfaces/ImageSurface','famous/core/Transform','famous/utilities/Utility','underscore'],function(require, exports, module) {
    var View = require('famous/core/View');
    var Modifier = require('famous/core/Modifier');
    var Surface = require('famous/core/Surface');
    var ScrollView = require('famous/views/Scrollview');
    var ContainerSurface = require('famous/surfaces/ContainerSurface');
    var SequentialLayout = require('famous/views/SequentialLayout');
    var ImageSurface = require('famous/surfaces/ImageSurface');
    var Transform          = require('famous/core/Transform');
    var Utility = require('famous/utilities/Utility');
    var _ = require('underscore');

    function BookGrid(options, datasource) {
        View.apply(this, arguments);
        this.books = [];
        if (!this.options.itemSize) {
            this.options.itemSize = [
                this.options.size[0] / this.options.itemsPerRow,
                this.options.size[1] / this.options.rowsOnScreen
            ];
        }
        this._imageHeight = (this.options.itemSize[1] * 0.4);

        this.gridRows = [];
        this.scrollView = new ScrollView({
            direction: Utility.Direction.Y,
            friction: 0,
            paginated: true,
            drag: 0.001
        });
        this.scrollView.sequenceFrom(this.gridRows);
        for (var i = 0; i < datasource.length; i++){
            this.addBookToGrid(datasource[i]);
        }
        this.add(this.scrollView);
    }

    BookGrid.prototype = Object.create(View.prototype);
    BookGrid.prototype.constructor = BookGrid;

    BookGrid.DEFAULT_OPTIONS = {
        itemSize: undefined,
        pictureAspectRatio: 0.769,
        itemsPerRow: 3,
        rowsOnScreen: 4
    };

    BookGrid.prototype.createBookSurface = function(data) {
        data.imageUrl = (!data.imageUrl ? 'content/images/books/1.jpg' : data.imageUrl);
        var container = new Surface({
            size: this.options.itemSize,
            classes: ['book-item'],
            content: this._bookRenderer(_.extend({imageHeight: this._imageHeight}, data))
        });
        container.data = data;
        container.on('click', function(target) {
            this._eventOutput.emit('book-item-clicked', {target: target, data:data});
        }.bind(this, container));
        return container;
    };

    BookGrid.prototype._bookRenderer = _.template(
        '<div class="book-info-block">' +
        '<img class="book-image" height="<%= imageHeight %>" src="<%= imageUrl %>">' +
        '<div class="book-price">$<%= price %></div>' +
        '<div class="book-name"><%= name %></div>' +
        '</div>'
    );

    function _createSequensialLayout() {
        var sequentialLayout = new SequentialLayout({direction: Utility.Direction.X});
        sequentialLayout.items = [];
        sequentialLayout.sequenceFrom(sequentialLayout.items);
        return sequentialLayout;
    }

    BookGrid.prototype.addBookToGrid = function(data) {
        var book = this.createBookSurface(data);
        this.books.push(book);
        if (this.gridRows.length === 0) {
            this.gridRows[this.gridRows.length] = _createSequensialLayout();
        }
        var lastRow = this.gridRows[this.gridRows.length - 1];
        if (lastRow.items.length >= this.options.itemsPerRow) {
            lastRow = _createSequensialLayout();
            this.gridRows[this.gridRows.length] = lastRow;
        }
        book.pipe(this.scrollView);
        lastRow.items.push(book);
    };

    module.exports = BookGrid;
});


define('activity/DummyHomeActivity',['require','exports','module','activity/common/Activity','famous/core/Surface','widgets/BookGrid','underscore'],function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');
    var BookGrid = require('widgets/BookGrid');
    var _ = require('underscore');

    var DUMMY_BOOK_DATA = [
        { name: 'Death on Demand', price: '9.20', imageUrl: 'content/images/books/1.jpg' },
        { name: 'Deeply Odd', price: '5.70', imageUrl: 'content/images/books/2.jpg' },
        { name: 'Funny Business', price: '20.00', imageUrl: 'content/images/books/3.jpg' },
        { name: 'Steve Jobs', price: '21.99', imageUrl: 'content/images/books/4.jpg' },
        { name: 'Sex Machine', price: '10.30', imageUrl: 'content/images/books/5.jpg' },
        { name: 'Jerusalem', price: '15.99', imageUrl: 'content/images/books/6.jpg' },
        { name: 'Dragon Warrior', price: '4.20', imageUrl: 'content/images/books/7.jpg' },
        { name: 'The Silver Linings Playbook', price: '9.70', imageUrl: 'content/images/books/8.jpg' },
        { name: 'The Goldfinch', price: '3.75', imageUrl: 'content/images/books/10.jpg' },
        { name: 'Death on Demand', price: '9.20', imageUrl: 'content/images/books/1.jpg' },
        { name: 'Deeply Odd', price: '5.70', imageUrl: 'content/images/books/2.jpg' },
        { name: 'Funny Business', price: '20.00', imageUrl: 'content/images/books/3.jpg' },
        { name: 'Steve Jobs', price: '21.99', imageUrl: 'content/images/books/4.jpg' },
        { name: 'Sex Machine', price: '10.30', imageUrl: 'content/images/books/5.jpg' },
        { name: 'Jerusalem', price: '15.99', imageUrl: 'content/images/books/6.jpg' },
        { name: 'Dragon Warrior', price: '4.20', imageUrl: 'content/images/books/7.jpg' },
        { name: 'The Silver Linings Playbook', price: '9.70', imageUrl: 'content/images/books/8.jpg' },
        { name: 'The Goldfinch', price: '3.75', imageUrl: 'content/images/books/10.jpg' }
    ];

    function DummyHomeActivity(options, app) {
        Activity.apply(this, arguments);
        var gridOptions = { rowsOnScreen: 4, itemsPerRow: 3 };
        switch (app.deviceInfo.sizeClassification) {
            case app.SizeClassification.SMALL:
                gridOptions = { rowsOnScreen: 2, itemsPerRow: 2 };
                break;
            case app.SizeClassification.LARGE:
                gridOptions = { rowsOnScreen: 5, itemsPerRow: 4 };
                break;
            case app.SizeClassification.XLARGE:
                gridOptions = { rowsOnScreen: 5, itemsPerRow: 4 };
                break;
        }
        if (app.deviceInfo.orientation === app.Orientation.LANDSCAPE) {
            if (app.deviceInfo.sizeClassification === app.SizeClassification.SMALL
                || app.deviceInfo.sizeClassification === app.SizeClassification.NORMAL) {
                gridOptions.itemsPerRow = 3;
                gridOptions.rowsOnScreen = 1;
            } else {
                var t = gridOptions.rowsOnScreen;
                gridOptions.rowsOnScreen = gridOptions.itemsPerRow;
                gridOptions.itemsPerRow = t;
            }
        }
        var bookGrid = new BookGrid(_.extend({
            size: this.options.size
        }, gridOptions), DUMMY_BOOK_DATA);
        bookGrid.on('book-item-clicked', function(event) {
            window.App.activityHolder.showCachedActivity('DummyBookDetailsActivity', undefined, event.data);
            window.App.bottomToolbar.setActiveItem(undefined);
        });
        this.add(bookGrid);
    }

    DummyHomeActivity.prototype = Object.create(Activity.prototype);
    DummyHomeActivity.prototype.constructor = DummyHomeActivity;

    DummyHomeActivity.prototype.prepareBottomToolbar = function(app, bottomToolbar) {

    };

    DummyHomeActivity.prototype.prepareNavigationBar = function(app, navigationBar) {
        navigationBar.setContent('Book store Famo.Us Demo');
    };

    module.exports = DummyHomeActivity;
});


define('activity/DummyBookDetailsActivity',['require','exports','module','activity/common/Activity','famous/core/Surface','famous/surfaces/ImageSurface','famous/core/Modifier','famous/core/Transform','underscore'],function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');
    var ImageSurface = require('famous/surfaces/ImageSurface');
    var Modifier = require('famous/core/Modifier');
    var Transform = require('famous/core/Transform');
    var _ = require('underscore');

    function DummyBookDetailsActivity(options, app) {
        Activity.apply(this, arguments);
        // Book title
        this.bookTitle = new Surface({
            classes: ['book-title'],
            size: [this.options.size[0] / 2, true],
            content: 'Loading'
        });
        this.add(this.bookTitle);
        var imageHeight = this.options.size[1] / 3;
        // Book image
        this.bookImage = new Surface({
            classes: ['book-image'],
            content: this._bookImageRenderer({url: 'content/images/books/1.jpg'}),
            size: [this.options.size[0] - this.bookTitle.size[0], imageHeight]
        });
        this.add(new Modifier({
            //transform: Transform.translate(0, 10),
            origin: [1, 0]
        })).add(this.bookImage);
        // Book price
        var priceHeight = '40';
        this.price = new Surface({
            classes: ['book-price'],
            size: [this.bookImage.size[0], priceHeight],
            content: '$0.00'
        });
        this.add(new Modifier({
            transform: Transform.translate(0, imageHeight + priceHeight),
            origin: [1, 0]
        })).add(this.price);
        // Added intro text
        var introHeight = 200;
        this.intro = new Surface({
            classes: ['intro-block'],
            size: [this.options.size[0], introHeight],
            content: this._bookIntroRenderer({text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas consequat ante orci, ac malesuada elit rhoncus eu. Quisque ultricies porttitor neque, a porttitor ipsum. Ut quis tortor et quam suscipit dictum in in nunc. Sed nec massa aliquam, consectetur diam ut, auctor leo. '})
        });
        this.add(new Modifier({
            transform: Transform.translate(0, imageHeight + priceHeight)
        })).add(this.intro);
    }

    DummyBookDetailsActivity.prototype = Object.create(Activity.prototype);
    DummyBookDetailsActivity.prototype.constructor = DummyBookDetailsActivity;

    DummyBookDetailsActivity.prototype.onBackAction = function(app, defaultBackAnimation) {
        app.activityHolder.showCachedActivity('DummyHomeActivity', defaultBackAnimation);
    };

    DummyBookDetailsActivity.prototype.beforeOpening = function(app, parameters) {
        this.bookImage.setContent(this._bookImageRenderer({url: parameters.imageUrl}));
        this.bookTitle.setContent(parameters.name);
    };

    DummyBookDetailsActivity.prototype._bookImageRenderer = _.template('<img class="book-image" alt="Cover" src="<%= url %>">');
    DummyBookDetailsActivity.prototype._bookIntroRenderer = _.template(
        '<div class="intro-label activity-label">Intro</div>' +
        '<div class="intro-text"><%= text %></div>'
    );

    module.exports = DummyBookDetailsActivity;
});


define('activity/DummyFavoritesActivity',['require','exports','module','activity/common/Activity','famous/core/Surface','widgets/BookGrid'],function(require, exports, module) {
    var Activity = require('activity/common/Activity');
    var Surface = require('famous/core/Surface');
    var BookGrid = require('widgets/BookGrid');

    var DUMMY_BOOK_DATA = [
        { name: 'Sex Machine', price: '10.30', imageUrl: 'content/images/books/5.jpg' },
        { name: 'Steve Jobs', price: '21.99', imageUrl: 'content/images/books/4.jpg' },
        { name: 'The Silver Linings Playbook', price: '9.70', imageUrl: 'content/images/books/8.jpg' },
        { name: 'The Goldfinch', price: '3.75', imageUrl: 'content/images/books/10.jpg' },
        { name: 'Jerusalem', price: '15.99', imageUrl: 'content/images/books/6.jpg' }
    ];

    function DummyFavoritesActivity(options, app) {
        Activity.apply(this, arguments);
        var bookGrid = new BookGrid({
            size: this.options.size
        }, DUMMY_BOOK_DATA);
        bookGrid.on('book-item-clicked', function(event) {
            window.App.activityHolder.showCachedActivity('DummyBookDetailsActivity', undefined, event.data);
            window.App.bottomToolbar.setActiveItem(undefined);
        });
        this.add(bookGrid);
    }

    DummyFavoritesActivity.prototype = Object.create(Activity.prototype);
    DummyFavoritesActivity.prototype.constructor = DummyFavoritesActivity;

    DummyFavoritesActivity.prototype.prepareBottomToolbar = function(app, bottomToolbar) {

    };

    DummyFavoritesActivity.prototype.prepareNavigationBar = function(app, navigationBar) {
        navigationBar.setContent('Favorites');
    };

    DummyFavoritesActivity.prototype.onBackAction = function(app, defaultBackAnimation) {
        app.activityHolder.showCachedActivity('DummyHomeActivity', defaultBackAnimation);
    };

    module.exports = DummyFavoritesActivity;
});

define('App',['require','exports','module','famous/views/HeaderFooterLayout','famous/core/Surface','famous/surfaces/ContainerSurface','famous/core/OptionsManager','widgets/common/NavigationBar','activity/common/ActivityHolder','widgets/common/BottomToolbar','widgets/common/BottomToolbarItem','activity/DummyHomeActivity','activity/DummyBookDetailsActivity','activity/DummyFavoritesActivity'],function(require, exports, module) {
    
    var HeaderFooterLayout = require('famous/views/HeaderFooterLayout');
    var Surface = require('famous/core/Surface');
    var ContainerSurface = require('famous/surfaces/ContainerSurface');
    var OptionsManager = require('famous/core/OptionsManager');
    var NavigationBar = require('widgets/common/NavigationBar');
    var ActivityHolder = require('activity/common/ActivityHolder');
    var BottomToolbar = require('widgets/common/BottomToolbar');
    var BottomToolbarItem = require('widgets/common/BottomToolbarItem');
    // Activities
    var DummyHomeActivity = require('activity/DummyHomeActivity');
    var DummyBookDetailsActivity = require('activity/DummyBookDetailsActivity');
    var DummyFavoritesActivity = require('activity/DummyFavoritesActivity');

    function App(context, options) {
        window.App = this;
        this.updateDeviceInfo();
        // Handeling options
        this.context = context;
        this.options = Object.create(App.DEFAULT_OPTIONS);
        this._optionsManager = new OptionsManager(this.options);
        if (options) this.setOptions(options);

        var mainLayout = new HeaderFooterLayout({
            headerSize: this.options.layout.headerHeight,
            footerSize: this.options.layout.footerHeight
        });
        // Preparing main layout components
        this.contentContainer = new ContainerSurface({
            size: [window.innerWidth,
                window.innerHeight-this.options.layout.headerHeight - this.options.layout.footerHeight],
            properties: {
                overflow: 'hidden'
            }
        });
        this.header = new NavigationBar({
            size: [window.innerWidth, mainLayout.options.headerSize],
            classes: ['app-header'],
            backContent: 'Back'
        });
        this.header._optionsManager.set('backClasses', ['back-button']);
        this.header._optionsManager.set('moreClasses', ['more-button']);

        this.footer = new ContainerSurface({
            size: [undefined, mainLayout.footerSize],
            classes: ['app-footer']
        });
        mainLayout.footer.add(this.footer);
        mainLayout.content.add(this.contentContainer);
        mainLayout.header.add(this.header);

        context.add(mainLayout);
        // Create bottom toolbar
        this.bottomToolbar = this.createBottomNavigation();

        // Register activity holder
        this.activityHolder = this.createActivityHolder();
        //

        this.activityHolder.showCachedActivity('DummyHomeActivity', this.activityHolder.ANIMATION.fadeIn);
        return this;
    }

    App.DEFAULT_OPTIONS = {
        layout: {
            headerHeight: 50,
            footerHeight: 60
        }
    };

    App.prototype.createBottomNavigation = function() {
        var bottomToolbar = new BottomToolbar({
            items: [
                new BottomToolbarItem({
                    id: 'home',
                    text: 'Home',
                    iconClass: 'glyphicon glyphicon-home',
                    onClick: function(data) {
                        this.activityHolder.showCachedActivity('DummyHomeActivity',
                            this.activityHolder.ANIMATION.slideFromLeft);
                        bottomToolbar.setActiveItem(data);
                    }.bind(this)
                }),
                new BottomToolbarItem({
                    id: 'favorites',
                    iconClass: 'glyphicon glyphicon-heart',
                    text: 'Favorites',
                    onClick: function(data) {
                        this.activityHolder.showCachedActivity('DummyFavoritesActivity');
                        bottomToolbar.setActiveItem(data);
                    }.bind(this)
                })
            ]
        });
        this.footer.add(bottomToolbar);
        return bottomToolbar;
    };

    App.prototype.createActivityHolder = function() {
        var activityHolder = new ActivityHolder({
            size: this.contentContainer.getSize(false)
        });
        this.contentContainer.add(activityHolder);
        // Creating activities
        activityHolder.createCachedActivity(DummyHomeActivity);
        activityHolder.createCachedActivity(DummyBookDetailsActivity);
        activityHolder.createCachedActivity(DummyFavoritesActivity);
        //
        this.header.on('back', function() {
            if (activityHolder.currentActivity) {
                activityHolder.currentActivity.onBackAction(window.App,
                    window.App.activityHolder.ANIMATION.slideFromLeft);
            }
        });
        return activityHolder;
    };
    App.prototype.setOptions = function setOptions(options) {
        return this._optionsManager.setOptions(options);
    };

    App.prototype.Orientation = {PORTRAIT: 0, LANDSCAPE: 1};
    App.prototype.SizeClassification = {XSMALL: 0, SMALL: 1, NORMAL: 2, LARGE: 3, XLARGE: 4};
    App.prototype.classifyScreenSize = function(width, height) {
        var sq = (width * height) / window.devicePixelRatio;
        if (sq <= 320*360) return this.SizeClassification.SMALL;
        if (sq <= 320*470) return this.SizeClassification.NORMAL;
        if (sq <= 640*480) return this.SizeClassification.LARGE;
        if (sq <= 720*640) return this.SizeClassification.XLARGE;
        return this.SizeClassification.XLARGE;
    };
    App.prototype.updateDeviceInfo = function() {
        this.deviceInfo = {
            orientation: window.innerWidth < window.innerHeight ? this.Orientation.PORTRAIT : this.Orientation. LANDSCAPE,
            sizeClassification: this.classifyScreenSize(window.innerWidth, window.innerHeight)
        };
    };

    module.exports = App;
});

/*globals define*/
define('main',['require','exports','module','fastclick','famous/core/Engine','famous/core/Surface','famous/core/Modifier','App'],function(require, exports, module) {
    
    // Disable tap delay
    var FastClick = require('fastclick');
    FastClick.attach(document.body);
    // import dependencies
    var Engine = require('famous/core/Engine');
    var Surface = require('famous/core/Surface');
    var Modifier = require('famous/core/Modifier');
    var App = require('App');

    // create the main context
    var mainContext = Engine.createContext();
    var app = new App(mainContext);

});


require(["main"]);
}());