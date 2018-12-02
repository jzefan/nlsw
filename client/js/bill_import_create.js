$(function () {
  "use strict";

  var en_array = ['bill_no', 'order', 'brand_no', 'block_len', 'width', 'thickness', 'size_type',
    'weight', 'block_num', 'total_weight', 'warehouse', 'ship_warehouse', 'sales_dep', 'billing_name',
    'contract_no', 'shipping_address', 'order_item_no', 'dimensions', 'product_type', 'sources'];
  var cn_array = {
    '提单号': 0, '移拨码单号': 0, '入库单号': 0,
    '订单项次号': 1, '订单编号-项次': 1, '订单编号': 1, '订单号-项次': 1, '订单号':1,
    '牌号': 2, '标准全名': 2, '标准号': 2, '标准名': 2, '钢号': 2,
    '长度': 3, '长': 3,
    '宽度': 4, '宽': 4,
    '厚度': 5, '厚': 5,
    '尺寸': 6, '尺寸信息': 6,
    '单重': 7,
    '发运数': 8, '块数': 8, '数量(块)': 8, '数量（块）': 8, '支数': 8,
    '计划出货重量': 9, '发货重量': 9, '可发货重量': 9, '计划重量': 9, '重量（T）':9, '重量(T)': 9, '重量':9,
    '发货库别': 11, '发货仓库': 11, '仓库': 11, '始发库': 11,
    '销售部门': 12, '销售组别': 12,
    '客户名称': 13, '客户': 13, '客户信息': 13, '客户编号': 13, '现有货主': 13, '现在货主': 13,
    '合同号': 14, '合同': 14, '客户采购案号': 14,
    '收货地址': 15,
    '订单项次': 16,
    '规格': 17,
    '产品型态': 18,
    '货物来源': 19
  };

  var rABS = typeof FileReader !== "undefined" && typeof FileReader.prototype !== "undefined" && typeof FileReader.prototype.readAsBinaryString !== "undefined";
  var use_worker = typeof Worker !== 'undefined';
  var isXlsx = true;
  var X; // XLS or XLSX pointer
  var table_excel; // dataTable used
  var excel_show = $("#import_execl");
  var excelInputData = [];

  var NORMAL       = 0;
  var SWITCH_WARE  = 1;
  var choice       = NORMAL;
  var existSources = false; // 是否存在货物来源列

  $("#execl_file").on('change', function(e) {
    choice = NORMAL;
    openButtonChangeHandler(e);
  });
  $("#execl_file_1").on('change', function(e) {
    choice = SWITCH_WARE;
    openButtonChangeHandler(e);
  });

  function openButtonChangeHandler(e) {
    e.stopPropagation();
    e.preventDefault();
    if (e.target.files.length > 0) {
      nlApp.setTitle('读取文件,请稍等...');
      nlApp.showPleaseWait();
      readExcel(e.target.files);
    }
  }

  function readExcel(files) {
    excelInputData = [];

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
    var html = '<thead><tr>';
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
        var departmentIdx = -1;
        existSources = false;
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
              $.each(head, function (idx, field) {
                if (field) {
                  html += '<th>' + field + '</th>';
                  if (field === '承运单位') {
                    departmentIdx = idx;
                  } else if (field === '货物来源') {
                    existSources = true;
                  }
                }
              });
              html += '</tr></thead><tbody>';
            }
          } else {
            var row = pasteLine(lines[i], head, db_header, departmentIdx);
            if (row.length > 0) {
              html += row;
            }
          }
        }

        if (found) {
          html += '</tbody>';
        }
      }
    });

    return (isCorrectHeader? html : "");
  }

  function set_table_data(fname, html_content) {
    if (html_content) {
      excel_show.html(html_content);
      if (table_excel) {
        table_excel.fnDestroy();
      }

      setElementValue($('#excel-filename'), '打开的文件: ' + fname);

      excel_show.html(html_content);
      table_excel = excel_show.dataTable(getDataTableParams(false, "300%"));

      $(table_excel).show();
    } else {
      bootbox.alert('不正确的Excel数据文件或文件无数据...');
    }

    nlApp.hidePleaseWait();
  }

  function process_wb(wb) {
    if (!isXlsx && typeof Worker !== 'undefined') {
      XLS.SSF.load_table(wb.SSF);
    }

    set_table_data(filename.name, to_csv(wb));
  }

  var filename;

  function find_header(line) {
    return ((line.indexOf('订单') >= 0) &&
        ((line.indexOf('长') >= 0 && line.indexOf('宽') >= 0 && line.indexOf('厚') >= 0) ||
         (line.indexOf('规格') >= 0)) );
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

  function pasteLine(line, head, db_header, departmentIdx) {
    var items = line.split(',');

    var iLen = items.length;
    var hLen = head.length;
    if (departmentIdx >= 0 && departmentIdx < iLen && $.trim(items[departmentIdx]) != '南京鑫鸿图储运有限公司') {
      return ""; // skip non-hongyuntu's record
    }

    var allCommas = true;
    for (var i = 0; i < iLen; i++) {
      items[i] = $.trim(items[i]).replace(/`/g, ",");
      if (items[i].length) {
        allCommas = false;
      }
    }

    if (allCommas) return "";

    var json = {};
    var result = '<tr>';
    if (iLen <= hLen) {
      for (var k = 0; k < iLen && head[k]; ++k) {
        result += '<td>' + items[k] + '</td>';
        json[db_header[k]] = items[k];
      }

      for (k = iLen; k < hLen && head[k]; ++k) {
        result += '<td></td>';
        json[db_header[k]] = "";
      }
    } else {
      for (i = 0; i < hLen && head[i]; ++i) {
        result += '<td>' + items[i] + '</td>';
        json[db_header[i]] = items[i];
      }
    }
    result += '</tr>';
    excelInputData.push(json);

    return result;
  }

  $('#excel_submit').on('click', function (e) {
    e.stopPropagation();
    e.preventDefault();
    if (excelInputData.length === 0) {
      bootbox.alert("无数据！请导入正确的Excel数据");
      return;
    }

    $("body").css("cursor", "progress");

    var validData = [];
    var hasOrder = true;
    excelInputData.forEach(function(row_data) {
      hasOrder = false;
      if (isExist(row_data.order_item_no) && row_data.order.length === 11) {
        row_data.order_no = row_data.order;
        row_data.order = getOrder(row_data.order_no, row_data.order_item_no);
        row_data.order_item_no = parseInt(row_data.order_item_no);
        hasOrder = true;
      } else {
        var tmp = row_data.order.split("-");
        if (tmp.length === 2) {
          row_data.order_no = tmp[0];
          row_data.order_item_no = parseInt(tmp[1]);
          row_data.order = getOrder(row_data.order_no, row_data.order_item_no);
          hasOrder = true;
        } else {
          row_data.order_no = row_data.order.substring(0, 11);
          row_data.order_item_no = 0;
          var sub = row_data.order.substring(11);
          if (sub) {
            var v = parseInt(sub);
            if (!isNaN(v)) {
              row_data.order_item_no = v;
              row_data.order = getOrder(row_data.order_no, row_data.order_item_no);
              hasOrder = true;
            }
          }
        }
      }

      if (hasOrder) {
        if (choice === SWITCH_WARE) {
          var findSameOrder = false;
          for (var i = 0; i < validData.length; ++i) {
            var valid = validData[i];
            if (valid.bill_no === row_data.bill_no && valid.order === row_data.order) {
              valid.block_num = (+valid.block_num) + (+row_data.block_num);
              valid.weight = (+valid.weight) + (+row_data.block_num);
              valid.total_weight = (+valid.total_weight) + (+row_data.total_weight);
              findSameOrder = true;
              break;
            }
          }

          if (!findSameOrder) {
            if (existSources) {
              row_data.ship_warehouse = "转外库";
            }
            validData.push(row_data);
          }
        } else {
          validData.push(row_data);
        }
      }
    });

    var req = getAJAXRequest('/create_bill', 'POST', validData);
    req.done(function (data) {
      $("body").css("cursor", "auto");

      if (data.ok) {
        if (data.noUpdatedData.length) {
          var tbody = $('#part-imprt-tbody');
          tbody.empty();
          var str = '<tr><td style="text-align: center;"><span class="label label-info">{0}</span></td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td><td>{12}</td><td>{13}</td><td>{14}</td><td>{15}</td><td>{16}</td><td>{17}</td><td>{18}</td><td>{19}</td></tr>';
          data.noUpdatedData.forEach(function(bill) {
            tbody.append(str.format(bill.status, getOrder(bill.order_no, bill.order_item_no), bill.bill_no,
              bill.brand_no ? bill.brand_no : '', bill.billing_name ? bill.billing_name : '',
              bill.sales_dep ? bill.sales_dep : '', bill.thickness ? bill.thickness : '',
              bill.width ? bill.width : '', bill.len ? bill.len : '', bill.size_type? bill.size_type : '',
              bill.weight ? bill.weight : '',
              bill.block_num ? bill.block_num : '',
              bill.total_weight ? bill.total_weight : '',
              bill.ship_warehouse ? bill.ship_warehouse : '',
              bill.shipping_address ? bill.shipping_address : '',
              bill.contract_no ? bill.contract_no : '',
              date2Str(bill.create_date), date2Str(bill.shipping_date),
              bill.creater ? bill.creater : '', bill.shipper ? bill.shipper : ''));
          });
          $('#part-import-btn-ok, #close-dialog').on('click', function() {
            $('#part-import-dialog').modal('hide');
            setElementValue($('#excel-filename'), '');
            $(table_excel).hide();
            excelInputData = [];
            $("#execl_file").val('');
            $("#execl_file_1").val('');
          });

          $('#part-import-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
        } else {
          bootbox.alert("导入数据成功", function () {
            setElementValue($('#excel-filename'), '');
            $(table_excel).hide();
            excelInputData = [];
            $("#execl_file").val('');
            $("#execl_file_1").val('');
          });
        }
      } else {
        bootbox.alert("导入数据失败:" + data.response);
      }
    });

    req.fail(function (jqXHR, textStatus) {
      bootbox.alert("导入数据失败: " + textStatus);
      $("body").css("cursor", "auto");
    });
  });

  ///////////////////////////////////////////////////
  // UI Input handle start
  ///////////////////////////////////////////////////
  var dataDict       = local_data;
  var iBillNo        = $('#bill-no');
  var iOrderNo       = $('#order-no');
  var iOrderItemNo   = $('#order-item-no');
  var sBillingName   = $('#billing_name');
  var sSalesDep      = $('#sales_dep');
  var sShipWarehouse = $('#ship_warehouse');
  var iBillThickness = $('#bill-thickness');
  var iBillWidth     = $('#bill-width');
  var iBillLength    = $('#bill-length');
  var iBillWeight    = $('#bill-weight');
  var checkForulma   = $('#bill-forumla');
  var iBillNum       = $('#bill-number');
  var iTotWeight     = $('#bill-tot-weight');
  var sBrand         = $('#brand_no');
  var sSizeType      = $('#size_type');
  var iContractNo    = $('#contract_no');
  var iProduct       = $('#product_type');
  var useForulma     = true;
  var allBills = [];
  var inputTbody = $('#input-bill-content');
  
  sBrand.select2();
  sBrand.select2('val', '');

  function initInputUIValues() {
    iBillNo.val("");
    iOrderNo.val("");
    iOrderItemNo.val("");
    iBillThickness.val("");
    iBillWidth.val("");
    iBillLength.val("");
    iBillWeight.val("");
    iBillNum.val("");
    iTotWeight.val("");
    iContractNo.val("");
    iProduct.val("");
    sBillingName.select2('val', '');
    unselected(sSalesDep);
    unselected(sShipWarehouse);
    sBrand.select2('val', '');
    sSizeType.val("定尺");
    checkForulma.iCheck('check');
    useForulma = true;
    inputTbody.empty();
    allBills = [];
  }

  var companyName = [];
  dataDict.company.forEach(function(cpy) {
    companyName.push(cpy.name);
  });

  dataDict.warehouse = sort_pinyin(dataDict.warehouse);
  initSelect(sBillingName, sort_pinyin(companyName), false);
  initSelect(sShipWarehouse, dataDict.warehouse, false);

  sBillingName.select2();
  sBillingName.select2('val', '');
  sShipWarehouse.select2();

  initInputUIValues();
  iBillThickness.ForceNumericOnly();
  iBillWidth.ForceNumericOnly();
  iBillLength.ForceNumericOnly();
  iBillWeight.ForceNumericOnly();
  iBillNum.ForceNumericOnly();
  iTotWeight.ForceNumericOnly();

  elementEventRegister(iOrderNo, "blur", function () {
    var me = $(this);
    var order_no = me.val();
    if (order_no.length != 11) {
      bootbox.alert('当前输入的订单号的长度是' + order_no.length + '位，长度必须为11位');
    }
  });

  elementEventRegister(iBillLength, "keyup paste", updateBillWeight);
  elementEventRegister(iBillWidth, "keyup paste", updateBillWeight);
  elementEventRegister(iBillThickness, "keyup paste", updateBillWeight);
  elementEventRegister(iBillNum, "keyup paste", updateBillWeight);

  function updateBillWeight() {
    if (useForulma) {
      var l = parseFloatHTML(iBillLength.val());
      var w = parseFloatHTML(iBillWidth.val());
      var t = parseFloatHTML(iBillThickness.val());
      var res = l * w * t * 7.85 * Math.pow(10, -9);
      if (res > 0) {
        var fixed = toFixedStr(res, 3);
        setElementValue(iBillWeight, fixed);
        setElementValue(iTotWeight, getStrValue((+fixed) * parseFloatHTML(iBillNum.val())));
      } else {
        iBillWeight.val("");
        iTotWeight.val("");
      }
    }
  }

  elementEventRegister(checkForulma, "ifChecked", function() {
    useForulma = true;
    setHtmlElementDisabled(iTotWeight, true);
    setHtmlElementDisabled(iBillNum, false);
    updateBillWeight();
  });

  elementEventRegister(checkForulma, "ifUnchecked", function() {
    useForulma = false;
    setHtmlElementDisabled(iTotWeight, false);
    setHtmlElementDisabled(iBillNum, true);
    iBillWeight.val("");
    iTotWeight.val("");
    iBillNum.val("");
  });

  elementEventRegister($('#ui_input_save'), "click", function () {
    if (allBills.length) {
      ajaxRequestHandle('/create_bill', 'POST', allBills, '数据保存', function() {
        initInputUIValues();
      });
    } else {
      bootbox.alert("没有数据, 请输入");
    }
  });

  elementEventRegister($('#add-one'), 'click', function() {
    var billNo = iBillNo.val();
    var orderNo = iOrderNo.val();
    var orderItemNo = iOrderItemNo.val();
    var billName = sBillingName.val();
    var totalWeight = iTotWeight.val();
    if (isEmpty(billNo)) {
      bootbox.alert('请输入提单号');
    } else if (isEmpty(orderNo)) {
      bootbox.alert('请输入订单号');
    } else if (orderNo.length != 11) {
      bootbox.alert('订单号的长度必须是11位, 当前输入长度为：' + orderNo.length);
    } else if (isEmpty(orderItemNo)) {
      bootbox.alert('请输入订单项次号');
    } else if (isEmpty(billName)) {
      bootbox.alert('请选择开单名称');
    } else if (isEmpty(totalWeight) && totalWeight > 0) {
      bootbox.alert('请输入总重量');
    } else {
      var isOk = true;
      var o = getOrder(orderNo, orderItemNo);
      for (var i = 0; i < allBills.length; ++i) {
        if (allBills[i].order === o) {
          bootbox.alert('不唯一, 订单号项次 + 提单号相同');
          isOk = false;
          break;
        }
      }
      if (isOk) {
        allBills.push({
          order: getOrder(orderNo, orderItemNo),
          bill_no : billNo,
          order_no : orderNo,
          order_item_no : orderItemNo,
          brand_no : isEmpty(sBrand.val()) ? "" : sBrand.val(),
          billing_name : billName,
          sales_dep: isEmpty(sSalesDep.val()) ? "" : sSalesDep.val(),
          block_len : isEmpty(iBillLength.val()) ? "" : iBillLength.val(),
          width : isEmpty(iBillWidth.val()) ? "" : iBillWidth.val(),
          thickness : isEmpty(iBillThickness.val()) ? "" : iBillThickness.val(),
          size_type : sSizeType.val(),
          weight : isEmpty(iBillWeight.val()) ? "" : iBillWeight.val(),
          block_num : isEmpty(iBillNum.val()) ? "" : iBillNum.val(),
          total_weight: totalWeight,
          ship_warehouse : isEmpty(sShipWarehouse.val()) ? "" : sShipWarehouse.val(),
          contract_no : isEmpty(iContractNo.val()) ? "" : iContractNo.val(),
          product_type: isEmpty(iProduct.val()) ? "" : iProduct.val()
        });

        var html = "";
        allBills.forEach(function(bill) {
          html += makeTableBodyTr(bill);
        });
        inputTbody.html(html);
        $('.redlink').on('click', function (e) {
          e.stopImmediatePropagation();
          var tr = $(this).closest('tr');
          allBills.remove(tr.index());
          tr.remove();
        });
      }
    }
  });

  function makeTableBodyTr(bill) {
    var str = '<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td>';
    for (var i = 0; i < 14; ++i) {
      str += "<td>{" + i + "}</td>";
    }
    str += "</tr>";

    return str.format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.billing_name,
      getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.block_len), bill.size_type,
      bill.block_num, getStrValue(bill.total_weight),
      bill.brand_no ? bill.brand_no : '',
      bill.sales_dep ? bill.sales_dep : '',
      bill.ship_warehouse ? bill.ship_warehouse : '',
      bill.contract_no ? bill.contract_no : '',
      bill.product_type ? bill.product_type : '');
  }
});
