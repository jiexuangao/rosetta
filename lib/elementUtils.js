import {isPlainObject, deserializeValue, extend} from './utils.js';
import {supportEvent} from './supportEvent.js';
import EvStore from "ev-store";
import h from 'virtual-dom/h';
import diff from 'virtual-dom/diff';
import createElement from 'virtual-dom/create-element';

/**
 *
 * @module query
 * @param {string} selector - the selector string for the wanted DOM
 * @param {HTMLNode} element - the scope in which selector will be seached in
 */
export function query(selector, element) {
    var found,
        maybeID = selector[0] == '#',
        maybeClass = !maybeID && selector[0] == '.',
        slice = [].slice,
        nameOnly = maybeID || maybeClass ? selector.slice(1) : selector,
        simpleSelectorRE = /^[\w-]*$/,
        isSimple = simpleSelectorRE.test(nameOnly);

    if (!element) {
        element = document;
    }

    return (element.getElementById && isSimple && maybeID) ?
        ((found = element.getElementById(nameOnly)) ? [found] : []) :
        (element.nodeType !== 1 && element.nodeType !== 9 && element.nodeType !== 11) ? [] :
        slice.call(
            isSimple && !maybeID && element.getElementsByClassName ?
            maybeClass ? element.getElementsByClassName(nameOnly) :
            element.getElementsByTagName(selector) :
            element.querySelectorAll(selector)
        );
}

/**
 *
 * @module bind
 * @param {string} type - the event name
 * @param {function} listener - callback of the event which will be executed when the event has been triggered
 * @param {object} context - the custom context when executing callback
 * @param {boolean} ifOnce - determin whether the callback which be executed only once
 */
export function bind(type, listener, context, ifOnce) {
    this.events = this.events || {};
    var queue = this.events[type] || (this.events[type] = []);
    queue.push({
        f: listener,
        o: context,
        ifOnce: ifOnce
    });
}


/**
 *
 * @module fire
 * @param {string} type - trigger event which is represented by type
 */
export function trigger(type) {
    this.events = this.events || {};
    var slice = [].slice,
        list = this.events[type];

    if (!list) {
        return;
    }

    var arg = slice.call(arguments, 1);
    for (var i = 0, j = list.length; i < j; i++) {
        var cb = list[i];
        if (cb.f.apply(cb.o, arg) === false) {
            break;
        }

        if (cb.ifOnce === true) {
            list.splice(i, 1);
            i--;
            j--;
        }
    }
}

/**
 *
 * @module updateRefs
 * @param {object} obj - the rosetta element instance
 * @param {HTMLNode} dom - the htmlnode of the rosetta element instance
 */
export function updateRefs(obj) {
    var dom = obj.root;

    for (var key in obj.$) {
        var node = query('[ref="' + key + '"]', dom);
        obj.$[key] = node;
    }
}

/**
 *
 * @function for triggering event on children
 * @param {object} obj - rosetta element instance
 * @param {string} type - event name
 */
export function triggerChildren(obj, type) {
    (obj.rosettaChildren || []).map((childItem) => {
        var item = childItem.obj;
        triggerChildren(item, type);
        item[type].call(item);
        item.fire(type, item);
    });
}


/*
 * @function getParent找到每个content的一级rosetta element的dom
 *
 */
export function getParent(dom) {
    var parent = dom.parentElement;
    if (!parent) {
        return ;
    }

    if (parent.getAttribute('isRosettaElem') === 'true') {
        return parent;
    } else {
        return getParent(parent);
    }
}


/**
 * @function attributeToProperty
 * @param name
 * @param value
 */
export function attributeToProperty(name, value) {
    if (name) {
        var item = this.properties[name] || String;
        var supportType = [Boolean, Date, Number, String, Array, Object];
        var index = supportType.indexOf(item);
        var typeFunc = supportType[index];
        var currentValue = this[name] || null;

        if (index < 0) {
            var typeFunc = item.type;
        }


        if (!(typeof typeFunc() == typeof value)) {
            // deserialize Boolean or Number values from attribute
            value = deserializeValue(value, typeFunc, currentValue);
        }

        // only act if the value has changed
        if (value !== currentValue) {
            if (isPlainObject(value)) {
                var configValue = extend({}, value, true);
            }

            this.__config[name] = configValue;
            this[name] = value;
        }

        return value;
  }
}

/*
 * @function handleAttr: change attributes to goal structure, if !!rosettaObj then change attributes to real value according to properties' type
 * @param {json} attr: attributes of elements
 * @param {object} rosettaObj: rosetta element instance
 */
export function handleAttr(attr, rosettaObj) {
    // 处理attributes，转换为attr和事件分离的格式；如果需要toRealType，则转换类型（比较消耗性能）
    var eventObj = {};
    var events = {};

    for (var name in attr) {
        var item = attr[name];

        if (!!rosettaObj) {
            attr[name] = attributeToProperty.call(rosettaObj, name, item);
        }

        if (supportEvent[name]) {
            eventObj['ev-' + supportEvent[name]] = item;
            events[supportEvent[name]] = 0; // root element代理之后设置为true
            delete attr[name];
        }
    }


    return {
        eventObj,
        attr,
        events
    }
}


/*
 * @function
 *
 */
export function updateChildElemRoot(obj) {
    var rosettaChildren = obj.rosettaChildren;
    var root = obj.root;

    (rosettaChildren || []).map((childItem) => {
        var item = childItem.obj;
        var id = childItem.id;

        var dom = query('[elemID="' + id + '"][class="' + item.type + '"]', root);
        item.root = dom[0];

        updateChildElemRoot(item);
    });
}

/*
 * @function
 *
 */
export function appendRoot(dom, parent, ifReplace) {
    var classes = parent.getAttribute('class');

    if (ifReplace == true) {
        var v = dom.getAttribute('class');
        dom.setAttribute('class', (v + ' ' + classes).replace(/r-invisible/g, ''));
        parent.parentElement.replaceChild(dom, parent);
    } else {
        parent.appendChild(dom);
        parent.setAttribute('class', classes.replace(/r-invisible/g, ''));
    }
}

/*
 *@function handleContent, put children into right place in the content
 * @param {array} contents contains children dom as an array
 */
export function handleContent(rObj, _shouldReplacedContent) {
    var contents = query('content', rObj.root);

    (contents || []).map(function (content, index) {
        var parent = getParent(content) || rObj.root;
        var num = parent.getAttribute('shouldReplacedContent');
        var children = _shouldReplacedContent[parseInt(num)];
        var newWrapper = document.createElement('div');
        newWrapper.setAttribute('class', 'content');

        var tmp = document.createDocumentFragment();
        for (var i = 0; i < children.length; i++) {
            var n = children[i];

            tmp.appendChild(n);
        }
        var selector = content.getAttribute('select');
        var result = query(selector, tmp);

        (children || []).map(function (child, i, arr) {
            var index = result.indexOf(child);
            if (index >= 0) {
                newWrapper.appendChild(arr.splice(i, 1)[0]);
            }
        });

        if (newWrapper.children.length > 0) {
            content.parentElement.replaceChild(newWrapper, content);
        } else {
            content.parentElement.removeChild(content);
        }
    });
}


/*
 * @function
 *
 */
export function handleEvent(obj) {
    function bindEvent(childObj) {
        // 每个子element需要代理的事件
        var events = childObj.shouldDelegateEvents;

        for (var type in events) {
            (function (eventName, ifBinded, itemObj) {
                var root = itemObj.root;

                var cb = function cb(e) {
                    eventRealCB(e, itemObj);
                };

                if (root && ifBinded === 0) {
                    if (root.addEventListener) {
                        root.addEventListener(eventName, cb, false);
                    } else {
                        root.attachEvent('on' + eventName, cb);
                    }
                }
            })(type, events[type], childObj);

            events[type] = 1;
        }
    }

    function handleChildren(obj) {
        bindEvent(obj);
        // 遍历每个子element
        (obj.rosettaChildren || []).map(function (childItem) {
            (function (childObj) {
                handleChildren(childObj);
            })(childItem.obj);
        });
    }

    handleChildren(obj);
}

function eventRealCB (e, obj) {
    e.stopPropagation();
    var parent = e.target;
    var root = obj.root;

    function findCB(parent) {
        if (parent == root || !parent) {
            return;
        }

        var realCallback = EvStore(parent)[e.type];
        if (!!realCallback) {
            realCallback.call(obj, e);
        } else {
            parent = parent.parentElement;
            findCB(parent);
        }
    }

    findCB(parent);
}

/*
 * @function getPatches
 * @param obj
 * @param oldTree
 */

export function getPatches(obj, oldTree) {
    //存在一个bug，虽然隔离开了纯粹只是
    obj = extend({}, obj, true);
    // 生成新vtree和patches
    let newTree = obj.__t(obj, obj.$);
    let oldAttrs = oldTree.properties.attributes;
    let newAttrs = newTree.properties.attributes;

    extend(newAttrs, {
        isRosettaElem: oldAttrs.isRosettaElem,
        shouldReplacedContent: oldAttrs.shouldReplacedContent,
        elemID: oldAttrs.elemID
    }, true);

    return {
        patches: diff(oldTree, newTree),
        newTree,
        obj
    }
}

/*
 * @function updateRosettaChildren : 将newObj中已经在oldObj中的替换为oldObj的值
 * @param oldObj
 * @param newObj
 *
 */

export function updateRosettaChildren(oldRChildren, newRChildren) {
    var oldLen = oldRChildren.length;

    (newRChildren || []).map((itemChild, index) => {
        if (index >= oldLen) {
            oldRChildren.push(itemChild);
        }
    });

    return oldRChildren;
}


export function findRosettaTag() {
    var elems = [];
    if (!!document.getElementsByClassName) {
        elems = document.getElementsByClassName('r-element');
    } else if (!!document.querySelectorAll) {
        elems = document.querySelectorAll('.r-element');
    } else {
        var doms = document.getElementsByTagName('*')
        for (var i = 0; i < doms.length; i++) {
            var item = doms[i];
            if (item.tagName.toLowerCase().indexOf('r-') >= 0) {
                elems.push(item);
            }
        }
    }

    return elems;
}

export function classNameToClass(opts) {
    if (opts && opts.className) {
        var oldO = opts.class.split(' ');
        var newO = opts.className.split(' ');
        opts.class = oldO.concat(newO).join(' ');
        delete opts.className;
    }

    return opts;
}