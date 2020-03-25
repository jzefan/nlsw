$(function () {
  "use strict";

  var rABS = typeof FileReader !== "undefined" && typeof FileReader.prototype !== "undefined" && typeof FileReader.prototype.readAsBinaryString !== "undefined";
  var use_worker = typeof Worker !== 'undefined';
  var isXlsx = true;
  var X; // XLS or XLSX pointer

  var iOrderNo       = $('#order-no');
  var iOrderWeight   = $('#order-weight');
  var sCustomerName  = $('#customer-name');
  var iCustomerCode  = $('#customer-code');
  var sDestination   = $('#destination');
  var sTransportMode = $('#transport-mode');
  var iConsignee     = $('#consignee');
  var iDsClient      = $('#ds-client');
  var iContractNo    = $('#contract-no');
  var iCustomerSaleman = $('#customer-saleman');
  var iReceivingCharge = $('#receiving-charge');
  var iConsigner     = $('#consigner');
  var inputTbody     = $('#input-plan-content');
  var iInputDate     = $('#order-input-grp');

  var allOrders = [];

  iInputDate.datetimepicker(getDateTimePickerOptions());
  sCustomerName.select2();
  sDestination.select2();

  var en_array = ['order_no', 'order_weight', 'customer_code', 'destination', 'customer_name', 'ds_client', 'transport_mode',
    'customer_saleman', 'consigner', 'status', 'contract_no', 'receiving_charge', 'consignee'];

  var cn_array = {
    '订单号': 0, '订单': 0,
    '订单量': 1,
    '客户代码': 2,
    '流向': 3, '发货目的地': 3,
    '客户名称': 4,
    '下游客户': 5,
    '运输方式': 6,
    '南钢业务员': 7, '客户业务员': 7,
    '业务员': 8,
    '订单状态': 9,
    '合同号': 10,
    '运价': 11, '接单价': 11,
    '收货人': 12
  };

  $("#import-file").on('change', function(e) {
    e.stopPropagation();
    e.preventDefault();
    if (e.target.files.length > 0) {
      nlApp.setTitle('读取文件,请稍等...');
      nlApp.showPleaseWait();
      readExcel(e.target.files);
    }
  });

  function readExcel(files) {
    allOrders = [];

    for (var i = 0; i < files.length; ++i) {
      filename = files[i];
      var reader = new FileReader();
      var ext = filename.name.split('.').pop().toLowerCase();
      isXlsx = (ext === 'xlsx');
      X = (isXlsx) ? XLSX : XLS;

      reader.onload = function (e) {
        var data = e.target.result;
        if (use_worker) {
          excelWorker(data, process_wb);
        } else {
          var wb = (rABS) ? X.read(data, {type: 'binary'}) : X.read(btoa(fixdata(data)), {type: 'base64'});
          process_wb(wb);
        }
      };

      if (rABS) {
        reader.readAsBinaryString(filename);
      } else {
        reader.readAsArrayBuffer(filename);
      }
    }
  }

  var XW = [ {
    msg: 'xls',
    rABS: '../js/plugins/sheetJS/XLS/xlsworker2.js',
    norABS: '../js/plugins/sheetJS/XLS/xlsworker1.js',
    noxfer: '../js/plugins/sheetJS/XLS/xlsworker.js'
  },
    {
      msg: 'xlsx',
      rABS: '../js/plugins/sheetJS/XLSX/xlsxworker2.js',
      norABS: '../js/plugins/sheetJS/XLSX/xlsxworker1.js',
      noxfer: '../js/plugins/sheetJS/XLSX/xlsxworker.js'
    }
  ];

  function excelWorker(data, cb) {
    var worker;
    if (use_worker) {
      if (isXlsx) {
        worker = new Worker(rABS ? XW[1].rABS : XW[1].norABS);
      } else {
        worker = new Worker(rABS ? XW[0].rABS : XW[0].norABS);
      }
      worker.onmessage = function (e) {
        switch (e.data.t) {
          case 'ready': break;
          case 'e': console.error(e.data.d); break;
          default: var xx = ab2str(e.data).replace(/\n/g,"\\n").replace(/\r/g,"\\r"); console.log("done"); cb(JSON.parse(xx)); break;
        }
      };

      if (rABS) {
        var val = s2ab(data);
        worker.postMessage(val[1], [val[1]]);
      } else {
        worker.postMessage(data, [data]);
      }
    } else {
      worker = isXlsx ? new Worker(XW[1].noxfer) : new Worker(XW[0].noxfer);
      worker.onmessage = function(e) {
        switch(e.data.t) {
          case 'ready': break;
          case 'e': console.error(e.data.d); break;
          case 'xlsx': cb(JSON.parse(e.data.d)); break;
          case 'xls':  cb(JSON.parse(e.data.d)); break;
        }
      };

      var arr = rABS ? data : btoa(fixdata(data));
      worker.postMessage({d:arr,b:rABS});
    }
  }

  function fixdata(data) {
    var o = "", l = 0, w = 10240;
    for(; l<data.byteLength/w; ++l) o+=String.fromCharCode.apply(null,new Uint8Array(data.slice(l*w,l*w+w)));
    o+=String.fromCharCode.apply(null, new Uint8Array(data.slice(l*w)));
    return o;
  }

  function ab2str(data) {
    var o = "", l = 0, w = 10240;
    for(; l<data.byteLength/w; ++l) o+=String.fromCharCode.apply(null,new Uint16Array(data.slice(l*w,l*w+w)));
    o+=String.fromCharCode.apply(null, new Uint16Array(data.slice(l*w)));
    return o;
  }

  function s2ab(s) {
    var b = new ArrayBuffer(s.length*2), v = new Uint16Array(b);
    for (var i=0; i != s.length; ++i) v[i] = s.charCodeAt(i);
    return [v, b];
  }

  function to_csv(workbook) {
    var isCorrectHeader = true;
    workbook.SheetNames.forEach(function (sheetName) {
      var csv = (isXlsx ? X.utils.sheet_to_csv(workbook.Sheets[sheetName]) : X.utils.make_csv(workbook.Sheets[sheetName]));
      if (csv.length > 0) {
        csv = csv.replace(/([^"]+)|("[^"]+")/g, function($0, $1, $2) {
          if ($2) {
            return $2.replace(/[\s+""]/g, '').replace(/,/g, "`");
          } else {
            return $1;
          }
        });
        var lines = csv.match(/[^\r\n]+/g);
        var found = false;
        var head = [], db_header = [];
        for (var i = 0; i < lines.length; i++) {
          if (!found) {
            if (i > 20) {
              isCorrectHeader = false;
              console.log("No Header found!");
              break;
            }

            if (find_header(lines[i])) {
              found = true;
              head = lines[i].split(',');
              db_header = get_header(head);
            }
          } else {
            pasteLine(lines[i], head, db_header);
          }
        }
      }
    });

    return isCorrectHeader;
  }

  function process_wb(wb) {
    if (!isXlsx && typeof Worker !== 'undefined') {
      XLS.SSF.load_table(wb.SSF);
    }

    var ok = to_csv(wb);
    if (!ok) {
      bootbox.alert('不正确的Excel数据文件或文件无数据...');
    } else {
      resetTable();
    }

    nlApp.hidePleaseWait();
  }

  var filename;

  function find_header(line) {
    return ((line.indexOf('订单号') >= 0) &&
      ((line.indexOf('订单量') >= 0 && line.indexOf('客户名称') >= 0 && line.indexOf('订单') >= 0) ||
        (line.indexOf('客户代码') >= 0)) );
  }

  function get_header(head) {
    return head.map(function (column) {
      var idx = -1;
      for (var key in cn_array) {
        if (column === key) {
          idx = cn_array[key];
          break;
        }
      }

      if (idx > -1) {
        return en_array[idx];
      } else {
        return column;
      }
    });
  }

  function pasteLine(line, head, db_header) {
    var items = line.split(',');

    var iLen = items.length;
    var hLen = head.length;

    var allCommas = true;
    for (var i = 0; i < iLen; i++) {
      items[i] = $.trim(items[i]).replace(/`/g, ",");
      if (items[i].length) {
        allCommas = false;
      }
    }

    if (allCommas) return;

    var json = {};
    if (iLen <= hLen) {
      for (var k = 0; k < iLen && head[k]; ++k) {
        json[db_header[k]] = items[k];
      }

      for (k = iLen; k < hLen && head[k]; ++k) {
        json[db_header[k]] = "";
      }
    } else {
      for (i = 0; i < hLen && head[i]; ++i) {
        json[db_header[i]] = items[i];
      }
    }

    allOrders.push({
      orderNo: json['order_no'],
      orderWeight : json['order_weight'],
      leftWeight: json['order_weight'],
      customerName : isEmpty(json['customer_name']) ? '' : json['customer_name'],
      entryTime : new Date(),
      customerCode : isEmpty(json['customer_code']) ? '' : json['customer_code'],
      destination : isEmpty(json['destination']) ? '' : json['destination'],
      transportMode : isEmpty(json['transport_mode']) ? '' : json['transport_mode'],
      consignee : isEmpty(json['consignee']) ? '' : json['consignee'],
      dsClient : isEmpty(json['ds_client']) ? '' : json['ds_client'],
      contractNo : isEmpty(json['contract_no']) ? '' : json['contract_no'],
      salesman : isEmpty(json['customer_saleman']) ? '' : json['customer_saleman'],
      receivingCharge : isEmpty(json['receiving_charge']) ? '' : json['receiving_charge'],
      consigner : isEmpty(json['consigner']) ? '' : json['consigner']
    });
  }

  /////////////////////////////////////////////////////////////////

  function initInputUIValues() {
    iOrderNo.val('');
    iOrderWeight.val('');
    sCustomerName.select2('val', '');
    iCustomerCode.val('');
    sDestination.select2('val', '');
    sTransportMode.val('船运');
    iConsignee.val('');
    iDsClient.val('');
    iContractNo.val('');
    iCustomerSaleman.val('');
    iReceivingCharge.val('');
    iConsigner.val('');
    unselected(sCustomerName);
    unselected(sDestination);
    inputTbody.empty();
    allOrders = [];
    if (iInputDate.length) {
      iInputDate.data("DateTimePicker").setDate('');
    }
  }

  initInputUIValues();

  iOrderWeight.ForceNumericOnly();
  iReceivingCharge.ForceNumericOnly();

  elementEventRegister(iOrderNo, "blur", function () {
    var me = $(this);
    var order_no = me.val();
    if (order_no.length != 11) {
      bootbox.alert('当前输入的订单号的长度是' + order_no.length + '位，长度必须为11位');
    } else {
      $.get('/order_plan_exist', {q: order_no}, function (data) {
        var obj = jQuery.parseJSON(data);
        if (obj.exist) {
          bootbox.alert('此订单号已经存在: ' + order_no);
          me.val('');
        }
      })
    }
  });

  elementEventRegister($('#ui_input_save'), "click", function (e) {
    e.stopPropagation();
    e.preventDefault();
    if (allOrders.length) {
      ajaxRequestHandle('/create_order_plan', 'POST', allOrders, '数据保存', function() {
        initInputUIValues();
        $('#import-file').val('');
      });
    } else {
      bootbox.alert("没有数据, 请输入或导入!");
    }
  });

  elementEventRegister($('#add-one'), 'click', function() {
    var orderNo = iOrderNo.val();
    var orderWeight = iOrderWeight.val();
    var customerName = sCustomerName.val();
    var inputDate = iInputDate.data("DateTimePicker").getDate();
    if (isEmpty(orderNo)) {
      bootbox.alert('请输入订单号');
    } else if (orderNo.length != 11) {
      bootbox.alert('订单号的长度必须是11位, 当前输入长度为：' + orderNo.length);
    } else if (isEmpty(orderWeight)) {
      bootbox.alert('请输入订单量');
    } else if (isEmpty(customerName)) {
      bootbox.alert('请输入客户名称');
    } else if (isEmpty(inputDate)) {
      bootbox.alert('请输入录单时间');
    } else {
      var isOk = true;
      for (var i = 0; i < allOrders.length; ++i) {
        if (allOrders[i].orderNo === orderNo) {
          bootbox.alert('不唯一, 订单号相同');
          isOk = false;
          break;
        }
      }

      if (isOk) {
        allOrders.push({
          orderNo: orderNo,
          orderWeight : orderWeight,
          leftWeight: orderWeight,
          customerName : customerName,
          entryTime : inputDate,
          customerCode : isEmpty(iCustomerCode.val()) ? '' : iCustomerCode.val(),
          destination : isEmpty(sDestination.val()) ? '' : sDestination.val(),
          transportMode : isEmpty(sTransportMode.val()) ? '' : sTransportMode.val(),
          consignee : isEmpty(iConsignee.val()) ? '' : iConsignee.val(),
          dsClient : isEmpty(iDsClient.val()) ? '' : iDsClient.val(),
          contractNo : isEmpty(iContractNo.val()) ? '' : iContractNo.val(),
          salesman : isEmpty(iCustomerSaleman.val()) ? '' : iCustomerSaleman.val(),
          receivingCharge : isEmpty(iReceivingCharge.val()) ? '' : iReceivingCharge.val(),
          consigner : isEmpty(iConsigner.val()) ? '' : iConsigner.val(),
        });

        resetTable();
      }
    }
  });

  function resetTable() {
    var html = "";
    var weight = 0;
    allOrders.forEach(function(order) {
      html += makeTableBodyTr(order);
      weight += +order.orderWeight;
    });
    inputTbody.html(html);

    setElementValue($('#total-weight'), getStrValue(weight));

    $('.redlink').on('click', function (e) {
      e.stopImmediatePropagation();
      var tr = $(this).closest('tr');
      allOrders.remove(tr.index());
      tr.remove();
    });
  }

  function makeTableBodyTr(order) {
    var str = '<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td>';
    for (var i = 0; i < 13; ++i) {
      str += "<td>{" + i + "}</td>";
    }
    str += "</tr>";

    return str.format(order.orderNo, getStrValue(order.orderWeight), order.customerName,
      order.customerCode ? order.customerCode : '',
      order.destination ? order.destination : '',
      order.transportMode,
      order.consignee ? order.consignee : '',
      order.dsClient ? order.dsClient : '',
      order.salesman ? order.salesman : '',
      order.consigner ? order.consigner : '',
      order.contractNo ? order.contractNo : '',
      getStrValue(order.receivingCharge),
      date2Str(order.entryTime));
  }
});