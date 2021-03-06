/*@require ./rosetta.css*/

/**
 * Rosetta - webcomponents like javascript library accelerate UI development
 * version 1.1.1
 *
 */

// define module dependency
import elementClassFactory from './rosettaElement.js';
import {ATTACHED, DETACHED, CREATED, ATTRIBUTECHANGE} from './lifeEvents.js';
import {htmlImport} from './htmlImport';
import {supportEvent} from './supportEvent.js';
import {isArray, extend, toPlainArray, isDomNode, isString, isFunction, deserializeValue, typeHandlers, document} from './utils.js';
import {updateRefs, triggerChildren, handleEvent, attributeToProperty, handleAttr, updateChildElemRoot, appendRoot, handleContent, query, bind, trigger, findRosettaTag, classNameToClass} from './elementUtils.js';


// vdom relavent
import h from 'virtual-dom/h';
import createElement from 'virtual-dom/create-element';


// define private instances
var _allRendered = false; // 调用init的开始置为false，本次渲染所有组件render完毕就是true；如果存在因未定义而未渲染的也算作是true，因此可以理解为“本次符合渲染条件的都渲染完了”
var _refers = {}; // to store ref of Rosetta element instance in Rosetta
var _elemClass = {};
var _shouldReplacedContent = [];
var _shouldDelegateEvents = {};

/*
 * @function start parse document and render rosetta element
 */
function init() {
    // 找到页面的r-xxx元素
    // 如果是Rosetta已经注册的元素类型，则create、render
    _allRendered = false;
    var elems = findRosettaTag();
    var i = 0;

    for (; i < elems.length; i++) {
        var item = elems[i];
        var type = item.tagName.toLowerCase();
        var options = {};
        var attrs = item.attributes || {};
        var children = [].slice.call(item.childNodes);
        var n = 0;

        for (; n < attrs.length; n++) {
            var content = attrs[n];
            options[content.name] = content.value;
        }

        if (getElemClass(type)) {
            Rosetta.render(Rosetta.create(type, options, children), item, true);
        }
    }

    _allRendered = true;
    trigger.call(Rosetta, 'ready');
}

/*
 * @function to create rosetta element obj
 * @param {string} type, type of rosetta element
 * @param {object} initArr, attributes of the newly created element
 * @return {object} vTree, contains referer of rosetta instance
 */
function create(type, initAttr, ...children) {
    if (!isString(type)) {
        return;
    }
    var vTree  = '';
    var l = children.length;
    var len = undefined;


    initAttr = initAttr || {};
    initAttr = classNameToClass(initAttr);



    if (l > 0) {
        len = children[l - 1];
    }
    if (typeof len === 'number') {
        children = [].slice.call(children, 0, l - 1);
    } else {
        len = 0;
    }

    len = len || 0;
    children = toPlainArray(children);



    if (type.indexOf('-') < 0) {
        // 将initAttr转换为对应this.properties的type的attr真实值，并处理好vtree要求的事件属性格式
        // 生成vtree
        var result = handleAttr(initAttr);
        var attr = result.attr;
        var eventObj = result.eventObj;
        var events = result.events;

        var newAttr = extend({
            attributes: attr
        }, eventObj, true);

        vTree = h.call(this, type, newAttr, children);
        vTree.__events = events;
        extend(_shouldDelegateEvents, events, true);

        return vTree;
    } else {
        // 查找是否存在class
        var ElemClass = getElemClass(type);
        if (!ElemClass) {
            return false;
        }

        // 生成rosetta elem的id
        var elemID = len++;
        // var elemID = Math.random();

        // 生成element实例
        var elemObj = new ElemClass();

        // 设置name为initAttr.ref的值
        elemObj.name = initAttr.ref ? initAttr.ref: '';
        // 将initAttr转换为对应this.properties的type的attr真实值，并处理好vtree要求的事件属性格式
        var result = handleAttr(initAttr, elemObj);
        var attr = result.attr;
        var eventObj = result.eventObj;
        var events = result.events;        // 设置id，设置elem实例的property为attribute
        elemObj.elemID = elemID;

        // 生成vtree
        vTree  = elemObj.__t(elemObj, elemObj.$);

        // 处理children，将children存起来，方便根节点render的时候统一处理children content的事情
        // rosetta节点的children都需要走content过滤的逻辑
        children.map((item, index) => {
            if (!item.nodeType) {
                children[index] = createElement(item, {
                    document: document
                });
            }
        });

        // 给当前的vtree序列号，便于根节点知道要把children插入到哪个content
        // 疑似bug，需要重点单测
        if (!!children) {
            _shouldReplacedContent.push(children);
        }

        // 更新rosetta element节点的属性值，因为rosetta element在编译的时候__t里有自动生成的代码，于是只能外围更新了
        extend(vTree.properties.attributes, {
            shouldReplacedContent: _shouldReplacedContent.length - 1,
            isRosettaElem: true,
            'class': (vTree.properties.attributes['class'] + ' ' + (initAttr['class'] || '')).trim(),
            elemID: elemID,
            id: initAttr['id'],
            style: initAttr['style']
        }, true);

        //vtree和robj相互引用，方便后面获取
        elemObj.vTree = vTree;
        vTree.rObj = elemObj;
        vTree.__events = events;

        // 派发created事件
        elemObj.fire(CREATED, elemObj);
        elemObj.created.call(elemObj);

        return vTree;
    }
}

/*
 * @function render element to dom, or render all the element in the document.body
 * @param {object} vTree is the vtree of rosetta element instance to be render to parent dom
 * @param {domnode} parentDOM is where rosetta element to be rendered to
 * @param {boolean} ifReplace represent whether to append to parentDOM or replace it
 */
function render(vTree, parentDOM, ifReplace) {
    // 如果没有参数，表示全document渲染dom
    if (vTree === undefined) {
        init();
        return;
    }

    // 处理parentDOM
    if (isString(parentDOM)) {
        parentDOM = qurey(parentDOM)[0];
    }

    // 生成dom
    var dom = createElement(vTree, {
        document: document
    });

    // 从vtree获得rosetta element instance
    var rObj = vTree.rObj;

    if (!parentDOM) {
        return;
    }

    if (!!rObj && rObj.isRosettaElem == true) {
        dom.rObj = rObj;
        rObj.root = dom;
        // 处理content
        handleContent(rObj, _shouldReplacedContent);
        // 疑似bug
        _shouldReplacedContent = [];
        // 更新内部dom节点的ref
        updateRefs(rObj);
        // 更新自己的ref到rosetta
        setRef(rObj.ref, rObj);

        // 派发element的ready事件（已经有dom，但是并未appedn到父节点上）
        triggerChildren(rObj, 'ready');
        rObj.ready.call(rObj);
        rObj.fire('ready', rObj);

        // 更新dom
        appendRoot(dom, parentDOM, ifReplace);
        // 更新内部rosetta element instance的root（render前都是虚拟dom，嵌套的子element实际没有dom类型的root）
        updateChildElemRoot(rObj);
        // 处理事件绑定: 遍历每个子rosetta element绑定事件，绑定自己的事情
        handleEvent(rObj);

        // 派发attached事件相关
        triggerChildren(rObj, ATTACHED);
        rObj.attached.call(rObj);
        rObj.fire(ATTACHED, rObj);
        return rObj;
    } else {
        // 处理事件代理
        handleEvent(document, _shouldDelegateEvents);
        _shouldDelegateEvents = {};
        // dom append到parentdom上
        appendRoot(dom, parentDOM, ifReplace);
    }


    // 逻辑
    // 更新content逻辑：获取所有的content标签，找到他的第一级rosetta element，获取这个rosetta element需要替换的content的编号shouldReplacedContent，查找children dom
    // 更新事件逻辑：将事件代理到每一级rosetta element的根root上，保存一份old已绑定事件，方便update的时候diff增加；当根节点上事件触发的时候，通过evstore查找当前dom上是否有对应事件的callback，如果有则执行，否则递归到parent；阻止冒泡（update的时候将当前的和old进行diff绑定diff的）
    // 更新内部ref逻辑：将ref属性设置到节点的attribute上，已经有dom的时候query一下ref=xxx获得dom，然后更新$

}

/*
 * @function for execute callback when current render all done
 * @params {function} cb, callbacks for all elements render done
 * @params {boolean} ifOnce, if execute once
 */
function ready(cb, ifOnce) {
    if (isFunction(cb)) {
        ifOnce = ifOnce === true ? true : false;
        if (_allRendered == true) {
            cb();
            !ifOnce && bind.call(Rosetta, 'ready', cb, null, ifOnce);
        } else {
            bind.call(Rosetta, 'ready', cb, null, ifOnce);
        }
    }
}


/*
 *
 *
 */

function getElemClass(type) {
    if (!type) {
        return;
    }

    return _elemClass[type];
}

/*
 * @function
 *
 */
function setElemClass(type, newClass) {
    if (!!type && !!newClass) {
        _elemClass[type] = newClass;
    }
}

/*
 * @function
 *
 */
function getRef(key, value) {
    if (!key) {
        return;
    }
    return _refers[key];
}

/*
 * @function
 *
 */
function setRef(key, value) {
    if (!!key && !!value) {
        _refers[key] = value;
    }
}



/**
 *
 * @param {json} options - options for prototype of custom element
 * @example, if it has no default value, then the value can be String/Object/
    {
        is: 'r-xxx'
        ready: function() {}
        created: function() {}
        attached: function() {}
        detached: function() {}
        attributeChanged: function() {}
        extends: 'type name'
        properties: {
            aaa: 'string',//used for deserializezing from an attribute
            bbb: [],
            prop: {
                type: String,
                notify: true,
                readOnly: true
            }
        }
    }
 * @param options.properties.xxx.type - Boolean, Date, Number, String, Array or Object
 * @param options.properties.xxx.value - boolean, number, string or function
 * String. No serialization required.
 * Date or Number. Serialized using  toString.
 * Boolean. Results in a non-valued attribute to be either set (true) or removed (false).
 * Array or Object. Serialized using JSON.stringify.
 *
 */
function Rosetta(opts) {
    // 组件注册接口
    // 创建新的组件class
    // 标记异步import加载器的该类型组件class已经定义
    // 返回类型为创建的新组件class
    var type = opts.is;
    var newClass = elementClassFactory(opts);

    setElemClass(type, newClass);
    htmlImport.factoryMap[opts.__rid] = true;
    return newClass;
}

extend(Rosetta, {
    'ref': getRef,

    render,
    create,
    ready,

    'import': htmlImport,

    'config': htmlImport.resourceMap
});

export default Rosetta;