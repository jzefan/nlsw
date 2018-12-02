/*!
 * Author: Abdullah A Almsaeed
 * Date: 4 Jan 2014
 * Description:
 *      This file should be included in all pages
 !**/

/*
 * Global variables. If you change any of these vars, don't forget 
 * to change the values in the less files!
 */
var left_side_width = 180; //Sidebar width in pixels

$(function () {
  "use strict";

  //Enable sidebar toggle
  $("[data-toggle='offcanvas']").click(function (e) {
    e.preventDefault();

    //If window is small enough, enable sidebar push menu
    if ($(window).width() <= 992) {
      $('.row-offcanvas').toggleClass('active');
      $('.left-side').removeClass("collapse-left");
      $(".right-side").removeClass("strech");
      $('.row-offcanvas').toggleClass("relative");
    } else {
      //Else, enable content streching
      $('.left-side').toggleClass("collapse-left");
      $(".right-side").toggleClass("strech");
    }
  });

  //Add hover support for touch devices
  $('.btn').bind('touchstart', function () {
    $(this).addClass('hover');
  }).bind('touchend', function () {
    $(this).removeClass('hover');
  });

  //Activate tooltips
  $("[data-toggle='tooltip']").tooltip();

  /*
   * Add collapse and remove events to boxes
   */
  $("[data-widget='collapse']").click(function () {
    //Find the box parent
    var box = $(this).parents(".box").first();
    //Find the body and the footer
    var bf = box.find(".box-body, .box-footer");
    if (!box.hasClass("collapsed-box")) {
      box.addClass("collapsed-box");
      bf.slideUp();
    } else {
      box.removeClass("collapsed-box");
      bf.slideDown();
    }
  });

  /*
   * ADD SLIMSCROLL TO THE TOP NAV DROPDOWNS
   * ---------------------------------------
   */
  $(".navbar .menu").slimscroll({
    height: "200px",
    alwaysVisible: false,
    size: "3px"
  }).css("width", "100%");

  /*
   * INITIALIZE BUTTON TOGGLE
   * ------------------------
   */
  $('.btn-group[data-toggle="btn-toggle"]').each(function () {
    var group = $(this);
    $(this).find(".btn").click(function (e) {
      group.find(".btn.active").removeClass("active");
      $(this).addClass("active");
      e.preventDefault();
    });

  });

  $("[data-widget='remove']").click(function () {
    //Find the box parent
    var box = $(this).parents(".box").first();
    box.slideUp();
  });

  /* Sidebar tree view */
  $(".sidebar .treeview").tree();

  /*
   * Make sure that the sidebar is streched full height
   * ---------------------------------------------
   * We are gonna assign a min-height value every time the
   * wrapper gets resized and upon page load. We will use
   * Ben Alman's method for detecting the resize event.
   *
   **/
  function _fix() {
    //Get window height and the wrapper height
    var height = $(window).height() - $("body > .header").height() - $("body > .footer").height();
    $(".wrapper").css("min-height", height + "px");
    var content = $(".wrapper").height();
    //If the wrapper height is greater than the window
    if (content > height)
    //then set sidebar height to the wrapper
      $(".left-side, html, body").css("min-height", content + "px");
    else {
      //Otherwise, set the sidebar to the height of the window
      $(".left-side, html, body").css("min-height", height + "px");
    }
  }

  //Fire upon load
  _fix();
  //Fire when wrapper is resized
  $(".wrapper").resize(function () {
    _fix();
    fix_sidebar();
  });

  //Fix the fixed layout sidebar scroll bug
  fix_sidebar();

  /*
   * We are gonna initialize all checkbox and radio inputs to
   * iCheck plugin in.
   * You can find the documentation at http://fronteed.com/iCheck/
   */
  $("input[type='checkbox'], input[type='radio']").iCheck({
    checkboxClass: 'icheckbox_minimal',
    radioClass: 'iradio_minimal'
  });

  $("#openExeclfile").change(function () {
    var file = $(this).val().replace(/C:\\fakepath\\/ig, '');
    $("#fileName").text(file);
    $("#filepath").text($(this).val());

  });
});

function fix_sidebar() {
  //Make sure the body tag has the .fixed class
  if (!$("body").hasClass("fixed")) {
    return;
  }

  //Add slimscroll
  $(".sidebar").slimscroll({
    height: ($(window).height() - $(".header").height()) + "px",
    color: "rgba(0,0,0,0.2)"
  });
}

/*END DEMO*/

/*
 * BOX REFRESH BUTTON 
 * ------------------
 * This is a custom plugin to use with the compenet BOX. It allows you to add
 * a refresh button to the box. It converts the box's state to a loading state.
 * 
 * USAGE:
 *  $("#box-widget").boxRefresh( options );
 * */
(function ($) {
  "use strict";

  $.fn.boxRefresh = function (options) {

    // Render options
    var settings = $.extend({
      //Refressh button selector
      trigger: ".refresh-btn",
      //File source to be loaded (e.g: ajax/src.php)
      source: "",
      //Callbacks
      onLoadStart: function (box) {
      }, //Right after the button has been clicked
      onLoadDone: function (box) {
      } //When the source has been loaded

    }, options);

    //The overlay
    var overlay = $('<div class="overlay"></div><div class="loading-img"></div>');

    return this.each(function () {
      //if a source is specified
      if (settings.source === "") {
        if (console) {
          console.log("Please specify a source first - boxRefresh()");
        }
        return;
      }
      //the box
      var box = $(this);
      //the button
      var rBtn = box.find(settings.trigger).first();

      //On trigger click
      rBtn.click(function (e) {
        e.preventDefault();
        //Add loading overlay
        start(box);

        //Perform ajax call
        box.find(".box-body").load(settings.source, function () {
          done(box);
        });
      });

    });

    function start(box) {
      //Add overlay and loading img
      box.append(overlay);

      settings.onLoadStart.call(box);
    }

    function done(box) {
      //Remove overlay and loading img
      box.find(overlay).remove();

      settings.onLoadDone.call(box);
    }
  };
})(jQuery);

/*
 * SIDEBAR MENU
 * ------------
 * This is a custom plugin for the sidebar menu. It provides a tree view.
 * 
 * Usage:
 * $(".sidebar).tree();
 * 
 * Note: This plugin does not accept any options. Instead, it only requires a class
 *       added to the element that contains a sub-menu.
 *       
 * When used with the sidebar, for example, it would look something like this:
 * <ul class='sidebar-menu'>
 *      <li class="treeview active">
 *          <a href="#>Menu</a>
 *          <ul class='treeview-menu'>
 *              <li class='active'><a href=#>Level 1</a></li>
 *          </ul>
 *      </li>
 * </ul>
 * 
 * Add .active class to <li> elements if you want the menu to be open automatically
 * on page load. See above for an example.
 */
(function ($) {
  "use strict";

  $.fn.tree = function () {

    return this.each(function () {
      var btn = $(this).children("a").first();
      var menu = $(this).children(".treeview-menu").first();
      var isActive = $(this).hasClass('active');

      //initialize already active menus
      if (isActive) {
        menu.show();
        btn.children(".fa-angle-left").first().removeClass("fa-angle-left").addClass("fa-angle-down");
      }
      //Slide open or close the menu on link click
      btn.click(function (e) {
        e.preventDefault();
        if (isActive) {
          //Slide up to close menu
          menu.slideUp();
          isActive = false;
          btn.children(".fa-angle-down").first().removeClass("fa-angle-down").addClass("fa-angle-left");
          btn.parent("li").removeClass("active");
        } else {
          //Slide down to open menu
          menu.slideDown();
          isActive = true;
          btn.children(".fa-angle-left").first().removeClass("fa-angle-left").addClass("fa-angle-down");
          btn.parent("li").addClass("active");
        }
      });

      /* Add margins to submenu elements to give it a tree look */
      menu.find("li > a").each(function () {
        var pad = parseInt($(this).css("margin-left")) + 10;

        $(this).css({"margin-left": pad + "px"});
      });

    });
  };

}(jQuery));

/* CENTER ELEMENTS */
(function ($) {
  "use strict";
  jQuery.fn.center = function (parent) {
    if (parent) {
      parent = this.parent();
    } else {
      parent = window;
    }
    this.css({
      "position": "absolute",
      "top": ((($(parent).height() - this.outerHeight()) / 2) + $(parent).scrollTop() + "px"),
      "left": ((($(parent).width() - this.outerWidth()) / 2) + $(parent).scrollLeft() + "px")
    });
    return this;
  }
}(jQuery));

var datatable_tabletools = {
  "sSwfPath": "js/plugins/datatables/TableTools/swf/copy_csv_xls_pdf.swf",
  "aButtons": [
    {
      "sExtends": "copy",
      "sButtonText": "拷贝"
    },
    {
      "sExtends": "csv",
      "sButtonText": "保存Excel/csv"
    }
  ]
};
var lang = {
  "sProcessing": "处理中...",
  "sLengthMenu": "显示 _MENU_ 项结果",
  "sZeroRecords": "没有匹配结果",
  "sInfo": "显示第 _START_ 至 _END_ 项结果，共 _TOTAL_ 项",
  "sInfoEmpty": "显示第 0 至 0 项结果，共 0 项",
  "sInfoFiltered": "(由 _MAX_ 项结果过滤)",
  "sInfoPostFix": "",
  "sSearch": "搜索:",
  "sUrl": "",
  "sEmptyTable": "表中数据为空",
  "sLoadingRecords": "载入中...",
  "sInfoThousands": ",",
  "oPaginate": {
    "sFirst": "首页",
    "sPrevious": "上页",
    "sNext": "下页",
    "sLast": "末页"
  },
  "oAria": {
    "sSortAscending": ": 以升序排列此列",
    "sSortDescending": ": 以降序排列此列"
  }
};

function getDataTableParams(withTools, xInner) {
  var dataTableParams = {
    "aaSorting": [[0, 'asc']],
    "iDisplayLength": 10,
    "aLengthMenu": [[10, 20, 50, 100, -1], [10, 20, 50, 100, "All"]],
    "sPaginationType": "full_numbers",
    "sScrollX": "100%",
    "sScrollXInner": xInner,
    "language": lang,
    "sDom": 'T<"clear">lfrtip'
  };

  if (withTools) {
    dataTableParams.oTableTools = datatable_tabletools;
  }

  return dataTableParams;
}

$(function () {
  $('.input-group.date').find('input').each(function () {
    this.value = '';
  });

  $('input:radio').iCheck({
    checkboxClass: 'icheckbox_square-green',
    radioClass: 'iradio_square-green',
    increaseArea: '20%' // optional
  });
  $('input:checkbox').iCheck({
    checkboxClass: 'icheckbox_square-green',
    radioClass: 'iradio_square-green',
    increaseArea: '20%' // optional
  });

  var show_search_data = $("#show_search_data");
  if (show_search_data.length > 0) {
    show_search_data.dataTable(getDataTableParams(true, "150%"));
  }

  $('[data-toggle="tooltip"]').tooltip({trigger: "hover", html: true});
  $('[data-toggle="popover"]').popover({trigger: 'hover', html: true});

  // render
  var blogs = $('#blog-content');
  if (blogs.length > 0) {
    blogs.html(local_html_data);
    var objEditor = CKEDITOR.replace('editor1', {
      toolbar: [
        {
          name: 'clipboard',
          groups: ['clipboard', 'undo'],
          items: ['Cut', 'Copy', 'Paste', 'PasteText', 'PasteFromWord', '-', 'Undo', 'Redo']
        },
        {
          name: 'basicstyles',
          groups: ['basicstyles', 'cleanup'],
          items: ['Bold', 'Italic', 'Underline', 'Strike', 'Subscript', 'Superscript', '-', 'RemoveFormat']
        },
        {
          name: 'paragraph',
          groups: ['list', 'indent', 'blocks', 'align', 'bidi'],
          items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'Blockquote', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock', '-', 'BidiLtr', 'BidiRtl', 'Language']
        },
        {name: 'links', items: ['Link', 'Unlink']},
        {name: 'insert', items: ['Image', 'Table', 'HorizontalRule', 'Smiley', 'SpecialChar', 'PageBreak']},
        {name: 'styles', items: ['Styles', 'Format', 'Font', 'FontSize']},
        {name: 'colors', items: ['TextColor', 'BGColor']},
        {name: 'tools', items: ['Maximize', 'ShowBlocks']}
      ]
    });

    var btnSubmit = $('#post-submit');

    $('#post-edit').on('click', function () {
      $('.post-remove').hide();
      showHtmlElement($('#editor-box'), true);
      setHtmlElementDisabled(btnSubmit, false);
    });

    btnSubmit.on('click', function () {
      var title = $('#post-title').val();
      if (title.length === 0) {
        bootbox.alert('请输入发布的标题!');
        return;
      }
      var html = objEditor.document.getBody().getHtml();
      if (html.length === 0) {
        bootbox.alert('没有内容可以发布,请输入!');
        return;
      }

      var content = '<div class="blog-post"><button class="btn btn-danger btn-sm pull-right post-remove" style="display:none;"><i class="fa fa-times"></i></button><h2 class="blog-post-title">' + title + '</h2><p class="blog-post-meta">作者:<a href="">' + local_user.userid + '</a> 日期:' + new Date().yyyymmdd_cn() + '</p>' + html + '</div>';
      ajaxRequestHandle('/post_submit', 'POST', {html: content}, '发布', function () {
        blogs.prepend(content);
        $('.post-remove').hide();
        showHtmlElement($('#editor-box'), false);
        $('.post-remove').on('click', function () {
          removePost($(this).parent());
        });

        setHtmlElementDisabled(btnSubmit, true);
      });
    });

    $('#post-delete').on('click', function () {
      $('.post-remove').toggle();
    });

    $('.post-remove').on('click', function () {
      removePost($(this).parent());
    });

    function removePost(self) {
      bootbox.confirm('您确定要删除? 删除后不能恢复!', function (result) {
        if (result) {
          self.remove();
          $('.post-remove').hide();
          ajaxRequestHandle('/post_update', 'POST', {html: blogs.html()}, '删除');
          $('.post-remove').show();
        }
      });
    }
  }
});

function parseFloatHTML(value) {
  return parseFloat(value.replace(/[^\d\.\-]+/g, '')) || 0;
}

function addZero(i) {
  if (i < 10) {
    i = "0" + i;
  }
  return i;
}

Date.prototype.yyyymmdd_cn = function (noMinute) {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth() + 1).toString(); // getMonth() is zero-based
  var dd = this.getDate().toString();
  if (noMinute) {
    return yyyy + '-' + (mm.length === 2 ? mm : '0' + mm[0]) + '-' + (dd.length === 2 ? dd : '0' + dd[0]);
  } else {
    var m = addZero(this.getMinutes());
    var h = addZero(this.getHours());
    return yyyy + '-' + (mm.length === 2 ? mm : '0' + mm[0]) + '-' + (dd.length === 2 ? dd : '0' + dd[0]) + ' ' + h + ":" + m;
  }
};

function date2Str(date, noMinute) {
  if (date) {
    if (Object.prototype.toString.call(date) === '[object Date]' || typeof date === 'string') {
      var m = moment(date);
      if (noMinute) {
        return m.format('YYYY-MM-DD');
      } else {
        return m.format('YYYY-MM-DD HH:mm');
      }
    }
    else if (moment.isMoment(date)) {
      if (noMinute) {
        return date.format('YYYY-MM-DD');
      } else {
        return date.format('YYYY-MM-DD HH:mm');
      }
    }
    else {
      var m = moment(date);
      if (noMinute) {
        return m.format('YYYY-MM-DD');
      } else {
        return m.format('YYYY-MM-DD HH:mm');
      }
    }
  } else {
    return '';
  }
}

function getDateTimePickerOptions() {
  return {
    autoclose: true,
    useCurrent: false,
    todayBtn: true,
    language: 'zh-cn',
    collapse: false,
    pickTime: false
  }
}

// Array Remove - By John Resig (MIT Licensed)
Array.prototype.remove = function (from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

if (!String.prototype.format) {
  String.prototype.format = function () {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function (match, number) {
      return typeof args[number] != 'undefined' ? args[number] : match;
    });
  };
}

jQuery.fn.ForceNumericOnly = function () {
  return this.each(function () {
    $(this).keydown(function (e) {
      var key = e.charCode || e.keyCode || 0;
      // allow backspace, tab, delete, enter, arrows, numbers and keypad numbers ONLY
      // home, end, period, and numpad decimal
      return (
      key == 8 ||   // delete
      key == 9 ||   // tab
      key == 13 ||  // enter
      key == 46 ||  // backspace
      key == 110 || // .
      key == 190 ||
      (key >= 35 && key <= 40) ||   // home, end, left, right
      (key >= 48 && key <= 57) ||   // Ensure that it is a number and stop the keypress
      (key >= 96 && key <= 105));
    });
  });
};

////////////////////////////////////////////////////////////////////////////////////
/////////// Help Function and Class
////////////////////////////////////////////////////////////////////////////////////
function leftPad(number, length) {
  var str = '' + number;
  while (str.length < length) {
    str = '0' + str;
  }

  return str;
}

function getOrder(order_no, item_no) {
  return order_no + '-' + leftPad(item_no, 3);
}

function sort_pinyin(arr) {
  return arr.sort(function (a, b) {
    return a.localeCompare(b);//, [ "zh-CN-u-co-pinyin" ]);
  });
}

function isEmpty(variable) {
  return (typeof variable === 'undefined' || !variable || 0 === variable.length);
}

function isExist(variable) {
  return ((typeof variable != 'undefined') && undefined != variable);
}

function elementEventRegister(elem, event_name, event_handler) {
  if (elem.length) {
    elem.on(event_name, event_handler);
  }
}

var nlApp;
nlApp = nlApp || (function () {
  var pleaseWaitDiv = $('<div class="modal fade" id="pleaseWaitDiv" role="dialog" style="display:none"><div class="modal-dialog" data-backdrop="static" data-keyboard="false"><div class="modal-content"><div class="modal-header"><h4 class="modal-title"><i class="fa fa-clock-o"></i>处理中...</h4></div><div class="modal-body center-block"><div class="progress progress-striped active"><div class="progress-bar" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%;"></div></div></div></div></div>');
  return {
    showPleaseWait: function () {
      $('body').css({'cursor': 'wait'});
      pleaseWaitDiv.modal({backdrop: 'static', keyboard: false}).modal('show');
    },
    hidePleaseWait: function () {
      $('body').css({'cursor': 'default'});
      pleaseWaitDiv.modal('hide');
    },
    setTitle: function (title) {
      pleaseWaitDiv = $('<div class="modal fade" id="pleaseWaitDiv" role="dialog" style="display:none"><div class="modal-dialog" data-backdrop="static" data-keyboard="false"><div class="modal-content"><div class="modal-header"><h4 class="modal-title"><i class="fa fa-clock-o"></i>' + title + '</h4></div><div class="modal-body center-block"><div class="progress progress-striped active"><div class="progress-bar" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%;"></div></div></div></div></div>');
//      pleaseWaitDiv = $('<div class="modal" id="pleaseWaitDiv" role="dialog" style="display:none"><div class="modal-dialog" data-backdrop="static" data-keyboard="false"><div class="modal-content"><h4>' + title + '</h4><div class="progress progress-striped active"><div class="progress-bar" role="progressbar" aria-valuenow="100" aria-valuemin="0" aria-valuemax="100" style="width: 100%;"></div></div></div></div>');
    }
  };
})();

function select2Setup(element, params, storeData) {
  element.select2({
    minimumInputLength: params.inputLength,
    placeholder: params.placeholder,
    initSelection: function (element, callback) {
    },
    ajax: {
      url: params.url,
      dataType: 'json',
      quietMillis: 100,
      data: function (term, page) {
        return {
          q: term,
          limit: -1
        };
      },
      results: function (data, page) {
        if (storeData) {
          storeData(data);
        }
        return {results: data.targetData}
      }
    },
    formatResult: function (data) {
      return "<div class='select2-user-result'>" + data.text + "</div>";
    },
    formatSelection: function (data) {
      return data.text;
    }
  });
}

function getAJAXRequest(url, type, data) {
  return $.ajax({
    url: url,
    type: type,
    data: JSON.stringify(data),
    dataType: 'json',
    contentType: 'application/json'
  });
}

function ajaxRequestHandle(route, method, data, action_msg, afterDone) {
  var request = getAJAXRequest(route, method, data);
  request.done(function (data) {
    if (data.ok) {
      if (action_msg === 'no_message') {
        if (isExist(afterDone)) {
          afterDone();
        }
      } else {
        bootbox.alert(action_msg + "成功", function () {
          if (isExist(afterDone)) {
            afterDone();
          }
        });
      }
    } else {
      bootbox.alert(action_msg + "失败:" + data.response);
    }
  });
  request.fail(function (jqXHR, textStatus) {
    bootbox.alert(action_msg + "失败: " + textStatus);
  });
}

function unselected(element) {
  if (element.length) {
    element.prop('selectedIndex', -1);
  }
}

function getRowChildren(element, idx) {
  return element.find('tr:eq(' + idx + ')');
}

function getTableCellChildren(element, idx) {
  return element.find('td:eq(' + idx + ')');
}

function tr_click(elements, func) {
  if (elements.length > 0) {
    elements.off('click');
    elements.on('click', function (e) {
      var me = $(this);
      elements.removeClass('invoice-highlighted');
      me.addClass('invoice-highlighted');

      func(e, me.index());
    });
  }
}

function setHtmlElementDisabled(elem, disabled) {
  if (elem.length > 0) {
    var type = elem[0].nodeName.toLowerCase();
    if (type === 'input' || type === 'select' || type === 'textarea') {
      elem.prop('disabled', disabled);
    } else {
      if (disabled) {
        elem.addClass('disabled');
      } else {
        elem.removeClass('disabled');
      }
    }
  }
}

function showHtmlElement(elem, show) {
  if (elem.length > 0) {
    if (show) {
      elem.show();
    } else {
      elem.hide();
    }
  }
}

function setElementValue(elem, value) {
  if (elem.length > 0) {
    var type = elem[0].nodeName.toLowerCase();
    if (type === 'input' || type === 'select' || type === 'textarea') {
      elem.val(value);
    } else {
      elem.text(value);
    }
  }
}

function getElementValue(elem) {
  if (elem.length > 0) {
    var type = elem[0].nodeName.toLowerCase();
    if (type === 'input' || type === 'select' || type === 'textarea') {
      return elem.val();
    } else {
      return elem.text();
    }
  }

  return '';
}

function isJqueryElementEmpty(elem) {
  return elem.length === 0;
}

function isNumeric(obj) {
  return !jQuery.isArray(obj) && obj - parseFloat(obj) >= 0;
}

function numberIntValider(elem, min, max) {
  var v = elem.val().replace(/[^0-9]/g, '');
  v = parseInt(v);
  if (isNaN(v) || v < min) {
    v = min;
    elem.val(min);
  } else if (v > max) {
    v = max;
    elem.val(v);
  } else {
    elem.val(v);
  }

  return v;
}

function numberFloatValider(elem, initValue, minValue, maxValue) {
  var v = elem.val();
  var old = v;
  if (isEmpty(v)) {
    elem.val('');
    return minValue;
  }

  if (!isNumeric(v)) {
    v = initValue;
  } else {
    if (v < minValue) {
      v = minValue;
    }
    if (maxValue && v > maxValue) {
      v = maxValue;
    }
  }

  if (old != v) {
    elem.val(v);
  }

  return Number(v);
}

function getStrValue(value) {
  if (isFinite(value)) {
    if (typeof value === 'number') {
      if (Math.floor(value) === value) {
        return value.toString();
      } else {
        return toFixedStr(value, 3).replace(/([0-9]+(\.[0-9]+[1-9])?)(\.?0+$)/, '$1')
      }
//    } else if (typeof value === 'string') {
//      return value.replace(/([0-9]+(\.[0-9]+[1-9])?)(\.?0+$)/,'$1');
    } else {
      return value;
    }
  } else {
    return '';
  }
}

function sameBill(a, b) {
  return (a.bill_no === b.bill_no && getOrder(a.order_no, a.order_item_no) === getOrder(b.order_no, b.order_item_no));
}

function sortByKey(array, key, order) {
  return array.sort(function (a, b) {
    var x = a[key];
    var y = b[key];
    if (order === "ASC") {
      return ((x < y) ? -1 : ((x > y) ? 1 : 0));
    } else {
      return ((x < y) ? 1 : ((x > y) ? -1 : 0));
    }
  });
}

function toFixedStr(num, precision) {
  if (Math.abs(num) < 0.00001) {
    return "0";
  } else {
//    var multiplier = Math.pow( 10, precision + 1 ),
//        wholeNumber = Math.floor( num * multiplier );
//    return String(Math.round( wholeNumber / 10 ) * 10 / multiplier);
//
    return (+(Math.round(+(num + 'e' + precision)) + 'e' + -precision)).toFixed(precision);
  }
}

function toFixedNumber(num, precision) {
  if (Math.abs(num) < 0.00001) {
    return 0;
  } else {
//    var multiplier = Math.pow( 10, precision + 1 ),
//        wholeNumber = Math.floor( num * multiplier );
//    return Math.round( wholeNumber / 10 ) * 10 / multiplier;
    return +((+(Math.round(+(num + 'e' + precision)) + 'e' + -precision)).toFixed(precision));
  }
}

function initSelect(element, items, needEmpty, selectedValue) {
  element.empty();
  if (items.length) {
    if (needEmpty) {
      element.append('<option>无-取消选择</option>');
    }

    items.forEach(function (item) {
      element.append('<option value="' + item + '">' + item + '</option>');
    });

    if (selectedValue) {
      if (items.indexOf(selectedValue) < 0) {
        element.append('<option value="' + selectedValue + '" selected>' + selectedValue + '</option>');
      }
      else {
        element.val(selectedValue);
      }
    }
    else {
      unselected(element);
    }
  }
  else if (selectedValue) {
    element.append('<option>无-取消选择</option>');
    element.append('<option value="' + selectedValue + '" selected>' + selectedValue + '</option>');
  }
}

function getSelectValue(element) {
  var val = element.val();
  if (val === '无-取消选择') {
    unselected(element);
    val = '';
  }
  return val;
}

// save to excel file
var tableToExcel = (function () {
  var uri = 'data:application/vnd.ms-excel;base64,',
    template = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>{worksheet}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--><meta http-equiv="content-type" content="text/plain; charset=utf-8"/></head><body><table>{table}</table></body></html>',
    base64 = function (s) {
      return window.btoa(unescape(encodeURIComponent(s)))
    },
    format = function (s, c) {
      return s.replace(/{(\w+)}/g, function (m, p) {
        return c[p];
      })
    };

  return function (table, name, filename) {
    var ctx = {worksheet: name || 'Worksheet', table: table};
    window.location.href = uri + base64(format(template, ctx));
  }
})();

function saveToExcel(bills, sheetname) {
  if (bills.length > 0) {
    var trArr = [];
    trArr.push('<tr><th>状态</th><th>提单号</th><th>订单号</th><th>订单项次号</th><th>牌号</th><th>开单名称</th><th>销售部门</th><th>厚度</th><th>宽度</th><th>长度</th><th>尺寸类型</th><th>客户价格</th><th>车船价格</th><th>代收代付价格</th><th>单重</th><th>块数</th><th>总重量</th><th>发货仓库</th><th>合同号</th><th>创建日期</th><th>发货日期</th><th>创建人</th><th>发货人员</th></tr>');
    var str = '<tr>';
    for (var i = 0; i < 23; ++i) {
      str += "<td>{" + i + "}</td>";
    }
    str += '</tr>';
    bills.forEach(function (b) {
      var price = getInvoicePriceInfo(b);
      trArr.push(str.format(b.status, b.bill_no, b.order_no, b.order_item_no,
        b.brand_no ? b.brand_no : '',
        b.billing_name ? b.billing_name : '',
        b.sales_dep ? b.sales_dep : '',
        getStrValue(b.thickness), getStrValue(b.width), getStrValue(b.len),
        b.size_type ? b.size_type : '', getStrValue(price.totalCustomerPrice), getStrValue(price.totalVehPrice), getStrValue(b.collection_price),
        getStrValue(b.weight), getStrValue(b.block_num), getStrValue(b.total_weight),
        b.ship_warehouse ? b.ship_warehouse : '',
        b.contract_no ? b.contract_no : '',
        date2Str(b.create_date), date2Str(b.shipping_date),
        b.creater ? b.creater : '', b.shipper ? b.shipper : ''));
    });

    tableToExcel(trArr.join('\n'), sheetname);
  } else {
    bootbox.alert('无数据可导出!');
  }
}

function getStrByStatus(text, status) {
  if (status === '已结算') {
    return '<code style="color:#9564ad">' + text + '</code>';
  } else if (status === '已开票') {
    return '<code style="color:blue">' + text + '</code>';
  } else if (status === '已回款') {
    return '<code style="color:green">' + text + '</code>';
  } else if (status === '已配发') {
    return '<code style="color:#dc143c">' + text + '</code>';
  } else if (status === '不需要结算') {
    return '<code style="color:darkgray">' + text + '</code>';
  } else if (status === '未结算') {
    return '<code style="color:red">' + text + '</code>';
  } else if (status === '待配发') {
    return '<code style="color:#000000">' + text + '</code>';
  } else {
    return '<code style="color:darkgray">' + text + '</code>';
  }
}

function getInvoicePriceInfo(bill) {
  function inner_convert(p, state) {
    return (p > 0) ? getStrByStatus(getStrValue(p), state) : '<code style="color:grey">无</code>';
  }

  var totCustPrice = 0;
  var totVehPrice = 0;
  var price_html = '';
  var ves_veh_price_html = '';
  var tn = 0;
  var str = '<div>{0}, <code style="color:black">{1}</code>, {2}</div>';
  bill.invoices.forEach(function (inv) {
    if (inv.veh_ves_name) {
      tn += inv.num;
      var w = bill.block_num > 0 ? inv.num * bill.weight : inv.weight;
      totCustPrice += inv.price * w;
      price_html += str.format(inv.veh_ves_name, getStrValue(w), inner_convert(inv.price, bill.status));

      totVehPrice += inv.veh_ves_price * w;
      ves_veh_price_html += str.format(inv.veh_ves_name, getStrValue(w), inner_convert(inv.veh_ves_price, bill.status));

      if (inv.vehicles.length) {
        var vstr = '<div>-->{0}, <code style="color:black">{1}</code>, {2}</div>';
        inv.vehicles.forEach(function (vo) {
          w = bill.block_num > 0 ? vo.send_num * bill.weight : vo.send_weight;
          ves_veh_price_html += vstr.format(vo.veh_name, getStrValue(w), inner_convert(vo.veh_price, bill.status));
          if (vo.veh_price > 0) {
            totVehPrice += vo.veh_price * w;
          }
        });
      }
    }
  });

  bill.customer_price = totCustPrice;

  return {
    customerPriceHtml: price_html,
    vehPriceHtml: ves_veh_price_html,
    totalCustomerPrice: totCustPrice,
    totalVehPrice: totVehPrice,
    totalNumber: tn
  };
}

function getAllList(needCheck, arr, field, sub_field) {
  var res = [], i, len;
  if (needCheck) {
    if (sub_field && sub_field.length) {
      for (i = 0, len = arr.length; i < len; ++i) {
        var item = arr[i];
        item[field].forEach(function (elem) {
          var val = elem[sub_field];
          if (val && res.indexOf(val) < 0) {
            res.push(val);
          }
        })
      }
    } else {
      for (i = 0, len = arr.length; i < len; ++i) {
        var val = arr[i][field];
        if (val && res.indexOf(val) < 0) {
          res.push(val);
        }
      }
    }
  } else {
    if (sub_field && sub_field.length) {
      for (i = 0, len = arr.length; i < len; ++i) {
        var item = arr[i];
        item[field].forEach(function (elem) {
          if (elem[sub_field]) {
            res.push(elem[sub_field]);
          }
        })
      }
    } else {
      for (i = 0, len = arr.length; i < len; ++i) {
        if (arr[i][field]) {
          res.push(arr[i][field]);
        }
      }
    }
  }

  return res;
};

function makeOption(name) {
  return '<option value="' + name + '">' + name + '</option>';
}


//////////////////////////////////////////////////////////
// class define
//////////////////////////////////////////////////////////
function operationEN2CN(text) {
  if (text == 'contain') {
    return '包含';
  } else if (text == 'eq') {
    return '等于';
  } else if (text == 'neq') {
    return '不等于';
  } else if (text == 'gt') {
    return '大于';
  } else if (text == 'lt') {
    return '小于';
  } else if (text == 'gte') {
    return '大于等于';
  } else if (text == 'lte') {
    return '小于等于';
  } else if (text == 'in') {
    return '区间';
  }
}

var SearchHandlerD = function (type) {
  this.uiElems = {
    sField: $('#all_search_fields'),
    sOperation: $('#field_oper'),
    bApply: $('#field_apply'),
    iFieldValue: $('#field_val'),
    sFieldValue: $('#field-val'),
    iFieldValueDate: $('#field-val-date'),
    iFieldValueDateGrp: $('#field-val-date-group'),
    iFieldValue2: $('#field_val2'),
    sFieldValue2: $('#field-val2'),
    iFieldValueDate2: $('#field-val-date2'),
    iFieldValueDateGrp2: $('#field-val-date-group2'),
    fieldValGrp2: $('#field_val_grp2'),
    tree: $('#search_condition_tree'),
    bAnd: $('#search_and'),
    bOr: $('#search_or'),
    bDelete: $('#search_del'),
    bExec: $('#search_exec'),
    bOK: $('#search_ok'),
    table: $('#search_table'),
    thead: $('#search_thead'),
    tbody: $('#search_tbody'),
    div_result_show: $('#search_result'),
    result_show: $('#search_result_show')
  };

  this.runOngoing = false;
  this.type = type;
  if (type === 'invoice') {
    this.data = {
      fields: [
        {name_cn: '运单号', name_en: 'waybill_no', operations: ['contain', 'eq', 'neq']},
        {name_cn: '车船号', name_en: 'vehicle_vessel_name', operations: ['contain', 'eq', 'neq']},
        {name_cn: '开单名称', name_en: 'ship_name', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发货单位', name_en: 'ship_customer', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发货日期', name_en: 'ship_date', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '发货目的地', name_en: 'ship_to', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发货仓库', name_en: 'ship_warehouse', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发运总重', name_en: 'total_weight', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '发货人', name_en: 'shipper', operations: ['contain', 'eq', 'neq']},
        {name_cn: '运单创建人', name_en: 'username', operations: ['contain', 'eq', 'neq']},
        {name_cn: '运单状态', name_en: 'state', operations: ['contain', 'eq', 'neq']}
      ]
    };
    showHtmlElement(this.uiElems.table, true);
    showHtmlElement(this.uiElems.div_result_show, false);
  } else if (type === 'bill') {
    this.data = {
      fields: [
        {name_cn: '提单号', name_en: 'bill_no', operations: ['contain', 'eq', 'neq']},
        {name_cn: '订单号', name_en: 'order_no', operations: ['contain', 'eq', 'neq']},
        {name_cn: '项次号', name_en: 'order_item_no', operations: [], noOperation: true},
        {name_cn: '牌号', name_en: 'brand_no', operations: ['contain', 'eq', 'neq']},
        {name_cn: '开单名称', name_en: 'billing_name', operations: ['contain', 'eq', 'neq']},
        {name_cn: '长', name_en: 'len', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '宽', name_en: 'width', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '厚', name_en: 'thickness', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '尺寸', name_en: 'size_type', operations: ['eq', 'neq']},
        {name_cn: '单块重', name_en: 'weight', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '实际块数', name_en: 'block_num', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '总重量', name_en: 'total_weight', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '剩余块数或重量', name_en: 'left_num', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '存放仓库', name_en: 'warehouse', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发货仓库', name_en: 'ship_warehouse', operations: ['contain', 'eq', 'neq']},
        {name_cn: '合同号', name_en: 'contract_no', operations: ['contain', 'eq', 'neq']},
        {name_cn: '销售部门', name_en: 'sales_dep', operations: ['contain', 'eq', 'neq']},
        {name_cn: '收货地址', name_en: 'shipping_address', operations: ['contain', 'eq', 'neq']},
        {name_cn: '创建日期', name_en: 'create_date', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '配发日期', name_en: 'shipping_date', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
//        { name_cn : '结算日期', name_en : 'settle_date', operations: [ 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in' ] },
        {name_cn: '创建人', name_en: 'creater', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发货人', name_en: 'shipper', operations: ['contain', 'eq', 'neq']},
        {name_cn: '状态', name_en: 'status', operations: ['eq', 'neq']}
      ]
    };
    showHtmlElement(this.uiElems.table, false);
    showHtmlElement(this.uiElems.div_result_show, true);
  } else if (type === 'invoice_bill') {
    this.data = {
      fields: [
        {name_cn: '车船号', name_en: 'vehicle_vessel_name', operations: ['contain', 'eq', 'neq']},
        {name_cn: '开单名称', name_en: 'ship_name', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发货目的地', name_en: 'ship_to', operations: ['contain', 'eq', 'neq']},
        {name_cn: '发货日期', name_en: 'ship_date', operations: ['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'in']},
        {name_cn: '提单号', name_en: 'bill_no', operations: ['contain', 'eq', 'neq']},
        {name_cn: '订单号', name_en: 'order_no', operations: ['contain', 'eq', 'neq']}
      ]
    };
  }

  var fields = {};
  this.data.fields.forEach(function (field) {
    fields[field.name_cn] = field.name_en;
  });

  this.fields = fields;
  this.selectOne = undefined;
  this.result = {};
};

SearchHandlerD.prototype.initial = function (route) {
  var self = this;
  var str = '<tr>';
  self.uiElems.sField.empty();
  this.data.fields.forEach(function (field) {
    if (!field.noOperation) {
      var opt = '<option value="{0}">{1}</option>'.format(field.name_en, field.name_cn);
      self.uiElems.sField.append(opt);
    }

    str += "<th>" + field.name_cn + "</th>";
  });
  if (self.type != 'invoice_bill') {
    self.uiElems.thead.empty();
    self.uiElems.thead.append(str + '</tr>');
    self.uiElems.tbody.empty();
  }

  self.uiElems.bApply.addClass('disabled');
  self.uiElems.bOK.addClass('disabled');
  unselected(self.uiElems.sOperation);
  self.uiElems.iFieldValue.val('');
  self.uiElems.sFieldValue.val('');
  self.uiElems.iFieldValueDate.val('');
  self.uiElems.iFieldValue2.val('');
  self.uiElems.sFieldValue2.val('');
  self.uiElems.iFieldValueDate2.val('');
  self.uiElems.iFieldValueDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change', function () {
    var oper = self.uiElems.sOperation.val();
    var v = self.uiElems.iFieldValueDate.val();
    if (oper && oper != 'in') {
      setHtmlElementDisabled(self.uiElems.bApply, !v);
    }
  });
  self.uiElems.iFieldValueDateGrp2.datetimepicker(getDateTimePickerOptions()).on('dp.change', function () {
    var v = self.uiElems.iFieldValueDate.val();
    setHtmlElementDisabled(self.uiElems.bApply, !v);
  });

  self.uiElems.tree.jstree({
    "core": {
      "animation": 0,
      "check_callback": true,
      'data': {
        'text': 'AND (并且)',
        'state': {
          'opened': true,
          'selected': true
        }
      }
    }
  });

  self.uiElems.tree.jstree('reflesh');
  self.runOngoing = false;

  self.uiElems.sField.on('change', function () {
    var value = this.value;
    if (value) {
      self.uiElems.iFieldValue.val('');
      self.uiElems.sFieldValue.val('');
      self.uiElems.iFieldValueDate.val('');
      self.uiElems.iFieldValue2.val('');
      self.uiElems.sFieldValue2.val('');
      self.uiElems.iFieldValueDate2.val('');
      self.uiElems.iFieldValue.prop('disabled', true);
      self.uiElems.iFieldValue2.prop('disabled', true);
      self.uiElems.fieldValGrp2.hide();

      self.uiElems.bApply.addClass('disabled');
      self.uiElems.sOperation.empty();
      for (var i = 0; i < self.data.fields.length; ++i) {
        var field = self.data.fields[i];
        if (field.name_en == value) {
          field.operations.forEach(function (operation) {
            var opt = '<option value="{0}">{1}</option>'.format(operation, operationEN2CN(operation));
            self.uiElems.sOperation.append(opt);
          });

          if (value.indexOf('date') >= 0) {
            showHtmlElement(self.uiElems.iFieldValueDateGrp, true);
            showHtmlElement(self.uiElems.iFieldValue, false);
            showHtmlElement(self.uiElems.sFieldValue, false);
          } else if (value == 'status' || value == 'size_type') {
            showHtmlElement(self.uiElems.sFieldValue, true);
            showHtmlElement(self.uiElems.iFieldValue, false);
            showHtmlElement(self.uiElems.iFieldValueDateGrp, false);
            self.uiElems.sFieldValue.empty();
            if (value == 'status') {
              self.uiElems.sFieldValue.append('<option>新建</option>');
              self.uiElems.sFieldValue.append('<option>已配发</option>');
              self.uiElems.sFieldValue.append('<option>已结算</option>');
            } else {
              self.uiElems.sFieldValue.append('<option>定尺</option>');
              self.uiElems.sFieldValue.append('<option>单定</option>');
            }
            unselected(self.uiElems.sFieldValue);
          } else {
            showHtmlElement(self.uiElems.iFieldValue, true);
            showHtmlElement(self.uiElems.iFieldValueDateGrp, false);
            showHtmlElement(self.uiElems.sFieldValue, false);
          }
          break;
        }
      }
      unselected(self.uiElems.sOperation);
    }
  });

  self.uiElems.sOperation.on('change', function () {
    var oper = this.value;
    self.uiElems.iFieldValue.prop('disabled', !oper);
    self.uiElems.sFieldValue.prop('disabled', !oper);
    self.uiElems.iFieldValueDate.prop('disabled', !oper);
    self.uiElems.iFieldValue2.prop('disabled', !oper);
    self.uiElems.sFieldValue2.prop('disabled', !oper);
    self.uiElems.iFieldValueDate2.prop('disabled', !oper);

    var fieldname = self.uiElems.sField.val();//.find('option:selected').text();
    if (oper == 'in') {
      showHtmlElement(self.uiElems.fieldValGrp2, true);
      if (fieldname.indexOf('date') >= 0) {
        showHtmlElement(self.uiElems.iFieldValueDateGrp2, true);
        showHtmlElement(self.uiElems.iFieldValue2, false);
      } else {
        showHtmlElement(self.uiElems.iFieldValueDateGrp2, false);
        showHtmlElement(self.uiElems.iFieldValue2, true);
      }
    } else {
      showHtmlElement(self.uiElems.fieldValGrp2, false);
      showHtmlElement(self.uiElems.iFieldValueDateGrp2, false);
      showHtmlElement(self.uiElems.iFieldValue2, true);
    }
  });

  self.uiElems.iFieldValue.on('keyup paste', function (e) {
    e.stopImmediatePropagation();
    var oper = self.uiElems.sOperation.val();
    if (oper && oper != 'in') {
      setHtmlElementDisabled(self.uiElems.bApply, !this.value);
    }
  });
  self.uiElems.sFieldValue.on('change', function (e) {
    e.stopImmediatePropagation();
    var oper = self.uiElems.sOperation.val();
    if (oper && oper != 'in') {
      setHtmlElementDisabled(self.uiElems.bApply, !this.value);
    }
  });
  self.uiElems.iFieldValue2.on('keyup paste', function (e) {
    e.stopImmediatePropagation();
    setHtmlElementDisabled(self.uiElems.bApply, !this.value);
  });

  self.uiElems.bApply.on('click', function () {
    var field = self.uiElems.sField.find('option:selected').text();//.val();
    var oper = self.uiElems.sOperation.find('option:selected').text();//.val();
    var value = self.uiElems.iFieldValue.val();
    var isDate = false;
    if (field.indexOf('日期') >= 0) {
      value = self.uiElems.iFieldValueDate.val();
      isDate = true;
    }
    if (oper == '区间') {
      var v2 = self.uiElems.iFieldValue2.val();
      if (isDate) {
        v2 = self.uiElems.iFieldValueDate2.val();
      }
      self.createNode({'text': field + ' ' + oper + ' ' + value + ' ' + v2});
    } else {
      if (field == '状态' || field == '尺寸') {
        value = self.uiElems.sFieldValue.val();
      }
      self.createNode({'text': field + ' ' + oper + ' ' + value});
    }
  });

  self.uiElems.bAnd.on('click', function () {
    self.createNode({"text": "AND (并且)"});
  });

  self.uiElems.bOr.on('click', function () {
    self.createNode({"text": "OR (或者)"});
  });

  self.uiElems.bDelete.on('click', function () {
    var ref = self.uiElems.tree.jstree(true);
    if (ref) {
      var sel = ref.get_selected();
      if (!sel.length) {
        return false;
      }
      var parent = ref.get_parent(sel);
      if (parent && parent != '#') {
        ref.delete_node(sel);
        ref.select_node(parent, true);
      }
    }
  });

  self.uiElems.bExec.on('click', function () {
    if (self.runOngoing) {
      return;
    }

    var ref = self.uiElems.tree.jstree(true);
    var json = ref.get_json('#');
    self.runOngoing = true;
    $.get(route, {q: JSON.stringify(json[0]), isNeedAnalysis: true, field: self.fields}, function (data) {
      var result = JSON.parse(data);
      console.log(result.ok);
      if (result.ok) {
        self.result = result;
        self.selectOne = -1;
        self._setDataAndShow();

        if (result.number > 500) {
          bootbox.alert('当前查询结果 = ' + result.number + ', 数量太多（超过500个），请进一步限定条件！');
        }
      } else {
        bootbox.alert("错误的条件!");
      }

      self.runOngoing = false;
    });
  });
};

SearchHandlerD.prototype.okEventHandler = function (ok) {
  var self = this;
  this.uiElems.bOK.on('click', function () {
    if (self.type == 'invoice') {
      if (undefined != self.selectOne && self.selectOne >= 0) {
        ok(self.result, self.selectOne);
      }
    } else {
      ok(self.result);
    }
  });
};

SearchHandlerD.prototype._setDataAndShow = function () {
  var self = this;

  self.uiElems.tbody.empty();
  if (self.type == 'invoice') {
    var str = "<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>";
    $.each(self.result.invoices, function (index, inv) {
      var state = '<span class="label label-success">新建</span>';
      if (inv.state === '已结算') {
        state = '<span class="label label-default">已结算</span>';
      } else if (inv.state === '已配发') {
        state = '<span class="label label-info">已配发</span>';
      }
      var html_row_str = str.format(inv.waybill_no,
        inv.vehicle_vessel_name ? inv.vehicle_vessel_name : '',
        inv.ship_name ? inv.ship_name : '',
        inv.ship_customer ? inv.ship_customer : '',
        inv.ship_date ? date2Str(inv.ship_date) : '',
        inv.ship_to ? inv.ship_to : '',
        inv.ship_warehouse ? inv.ship_warehouse : '',
        getStrValue(inv.total_weight),
        inv.shipper ? inv.shipper : '',
        inv.username ? inv.username : '',
        state);
      self.uiElems.tbody.append(html_row_str);
    });

    tr_click(self.uiElems.tbody.find('tr'), function (e, index) {
      if (index >= 0) {
        self.uiElems.bOK.removeClass('disabled');
        self.selectOne = index;
      }
    });
  } else {
//    $.each(data, function(index, bill ) {
//      var html_row_str = str.format(bill.bill_no, bill.order_no, bill.order_item_no,
//          bill.brand_no ? bill.brand_no: '',
//          bill.billing_name ? bill.billing_name: '',
//          bill.len ? bill.len: '',
//          bill.width ? bill.width: '',
//          bill.thickness ? bill.thickness: '',
//          bill.size_type ? bill.size_type: '',
//          bill.weight ? bill.weight.toFixed(3): '',
//          bill.price ? bill.price: '',
//          bill.block_num ? bill.block_num: '',
//          bill.total_weight ? bill.total_weight: '',
//          bill.left_num ? bill.left_num: '',
//          bill.warehouse ? bill.warehouse: '',
//          bill.ship_warehouse ? bill.ship_warehouse: '',
//          bill.contract_no ? bill.contract_no: '',
//          bill.sales_dep ? bill.sales_dep: '',
//          bill.shipping_address ? bill.shipping_address: '',
//          bill.create_date ? new Date(bill.create_date).yyyymmdd_cn(): '',
//          bill.status ? bill.status: ''
//      );
//      self.uiElems.tbody.append(html_row_str);
//    });

    if (self.result.bills.length) {
      setHtmlElementDisabled(self.uiElems.bOK, false);
      self.uiElems.result_show.text('共查询出提单记录数:' + self.result.bills.length);
    } else {
      setHtmlElementDisabled(self.uiElems.bOK, true);
      self.uiElems.result_show.text('没有找到数据, 请检查查询条件!');
    }
  }
};

SearchHandlerD.prototype.createNode = function (obj) {
  var ref = this.uiElems.tree.jstree(true);
  if (!ref) return false;
  createTreeNode(ref, obj);
};

function createTreeNode(ref, obj) {
  var sel = ref.get_selected();
  if (!sel.length) {
    sel = ref.create_node('#', obj);
    ref.select_node(sel, true);
    ref.open_node(sel, true);
    return true;
  }

  var text = ref.get_text(sel);
  if (text == obj['text']) {
    return false;
  }
  if (text.indexOf('AND') >= 0 || text.indexOf('OR') >= 0) {
    sel = sel[0];
    sel = ref.create_node(sel, obj);
  } else {
    sel = ref.get_parent(sel);
    if (!sel.length) {
      return false;
    }
    text = ref.get_text(sel);
    if (text == obj['text']) { // AND 下面不能在插入AND, 同样OR也是
      return false;
    }
    sel = ref.create_node(sel, obj);
  }
  ref.deselect_all(true);
  ref.select_node(sel, true);
  return true;
}

///
var FilterElementD = function (elemName, initOptions, dropRight, withSelectedAll, next) {
  this.elem = elemName;
  this.options = initOptions.slice();
  this.visibleOptions = initOptions.slice();
  this.selected = [];

  initSelect(this.elem, this.options, false);

  var self = this;
  var option = {
    buttonWidth: '100%',
    maxHeight: 300,
    dropRight: dropRight,
    enableFiltering: true,
    filterPlaceholder: '查询',

    buttonText: function (options, select) {
      if (options.length === 0) {
        return '未选择...';
      } else if (options.length > 1) {
        return '选择了' + options.length + '个';
      } else {
        var labels = [];
        options.each(function () {
          if ($(this).attr('label') !== undefined) {
            labels.push($(this).attr('label'));
          } else {
            labels.push($(this).html());
          }
        });
        return labels.join(', ');
      }
    },

    onChange: function (option, checked) {
      var v = 'select-all-value';
      if (option) {
        v = option.val();
      }

      if (checked === true) {
        if (v === 'select-all-value') {
          self.selected = self.visibleOptions.slice();
        } else {
          if (self.selected.indexOf(v) < 0) {
            self.selected.push(v);
          }
        }
      } else if (checked === false) {
        if (v === 'select-all-value') {
          self.selected = [];
        } else {
          for (var i = self.selected.length - 1; i >= 0; --i) {
            if (self.selected[i] === v) {
              self.selected.remove(i);
              break;
            }
          }
        }
      }

      if (next) {
        next(self.selected);
      }
    }
  };

  if (withSelectedAll) {
    option.includeSelectAllOption = true;
    option.selectAllText = '选择全部';
    option.selectAllValue = 'select-all-value';
  }

  this.elem.multiselect(option);
};

FilterElementD.prototype.rebuild = function (visibleOptions, selectedValues) {
  this.visibleOptions = visibleOptions.slice();
  initSelect(this.elem, visibleOptions, false);
  this.elem.multiselect('rebuild');
  if (selectedValues) {
    this.elem.multiselect('select', selectedValues);
  }
};

FilterElementD.prototype.selectAll = function () {
  this.elem.multiselect('selectAll', false);
  this.elem.multiselect('updateButtonText');
};

FilterElementD.prototype.selectNone = function () {
  return this.selected.length === 0;
};

FilterElementD.prototype.rebuildAndSelectAll = function (visibleOptions) {
  var self = this;
  self.visibleOptions = visibleOptions.slice(0);
  initSelect(self.elem, visibleOptions, false);
  self.elem.multiselect('rebuild');
  self.elem.multiselect('selectAll', false);
  self.elem.multiselect('updateButtonText');
  self.selected = visibleOptions.slice(0);
};

FilterElementD.prototype.disabled = function (disalbed) {
  if (disalbed) {
    this.elem.multiselect('disable');
  } else {
    this.elem.multiselect('enable');
  }
};
