$(function () {
  "use strict";

  var iBillingName   = $('#billing_name');
  var iContractNo    = $('#contract_no');
  var iShipWarehouse = $('#ship_warehouse');

  var sOrderNo     = $('#mod_order_no');
  var sOrderItemNo = $('#order_item_no');
  var sBillNo      = $('#bill_no');
  var data_tbody   = $('#data_tbody');

  var selectedBill;
  var selectedIdx = 0;
  var curr_bills = [];
  var selected_bills = [];

  var btnDelete = $('#remove-some');
  $('#action-button').html('<input id="select-all" type="checkbox" data-toggle="tooltip" data-placement="bottom" title="选择所有记录" />');
  var checkSelectAll = $('#select-all');

  var isModify = false;
  if (sOrderNo.length) { // 修改
    isModify = true;
    var billsByOrder = [];
    var queryData = {};
    select2Setup(sOrderNo, {inputLength: 5, placeholder: '查找订单号', url: '/get_bill'}, function(data){
      queryData = data;
    });

    // 订单号处理
    sOrderNo.change(function (e) {
      if (e.added) {
        var order_no = e.added.text;
        var items = queryData.orderItemNoMap[order_no].sort();
        sOrderItemNo.empty();
        sBillNo.empty();
        items.forEach(function(item) {
          sOrderItemNo.append('<option>' + item + '</option>');
        });

        unselected(sOrderItemNo);

        billsByOrder = getBillsByNo(queryData.bills, {order_no: order_no, item_no: ''});
        if (billsByOrder.length == 1) {
          sBillNo.append('<option>' + billsByOrder[0].bill_no + '</option>');
        }

        curr_bills = billsByOrder;
        resetTableRow();
      }
    });

    // 订单项次号处理
    sOrderItemNo.change(function () {
      var str = this.value;// $('select#order_item_no option:selected').text();
      if (str.length > 0) {
        sBillNo.empty();
        var bills = getBillsByNo(billsByOrder, {order_no: '', item_no: str});
        curr_bills = bills;
        resetTableRow();

        bills.forEach(function (bill) {
          sBillNo.append('<option>' + bill.bill_no + '</option>');
        });

        if (bills.length > 1) {
          unselected(sBillNo);
        }
      }
    });

    // 提单处理
    sBillNo.change(function () {
      var str = $('select#bill_no option:selected').text();
      if (str) {
        var item_no = $('select#order_item_no option:selected').text();
        if (item_no) {
          for (var i = 0; i < billsByOrder.length; ++i) {
            var bill = billsByOrder[i];
            if (bill.bill_no == str && bill.order_item_no == item_no) {
              curr_bills = [];
              curr_bills.push(bill);
              resetTableRow();
              break;
            }
          }
        }
      }
    });
  } else {  // end of modify bill
    var sOrderNoDel = $('#del_order_no');
    var sBillNoDel = $('#del_bill_no');

    var billQueryData = {};
    if (sOrderNoDel.length > 0) {
      select2Setup(sOrderNoDel, {inputLength: 5, placeholder: '查找订单号', url: '/get_bill'}, function (data) {
        queryData = data;
        billQueryData = {};
      });

      sOrderNoDel.change(function (e) {
        if (e.added) {
          sBillNoDel.empty();
          curr_bills = getBillsByNo(queryData.bills, {order_no: e.added.text});
          resetTableRow();
        }
      });
    }

    if (sBillNoDel.length > 0) {
      select2Setup(sBillNoDel, {inputLength: 5, placeholder: '查找提单号', url: '/get_bill_by_bno'}, function (data) {
        billQueryData = data;
        queryData = {};
      });

      sBillNoDel.change(function (e) {
        if (e.added) {
          sOrderNoDel.empty();
          curr_bills = getBillsByNo(billQueryData.bills, {bill_no: e.added.text});
          resetTableRow();
        }
      });
    }

    elementEventRegister(btnDelete, 'click', function() {
      if (selected_bills.length > 0) {
        for (var i = 0; i < selected_bills.length; ++i) {
          if (selected_bills[i].status != '新建') {
            bootbox.alert('选择的提单中存在状态是"' + selected_bills[i].status + '",不能删除!');
            return;
          }
        }
        bootbox.confirm('危险!您确定要全部删除? 删除后不能恢复!', function (result) {
          if (result) {
            ajaxRequestHandle('/delete_bill', 'POST', selected_bills, '删除', function () {
              var tmp_bills = [];
              for (var k = 0; k < curr_bills.length; ++k) {
                var found = false;
                for (var m = 0; m < selected_bills.length; ++m) {
                  if (sameBill(curr_bills[k], selected_bills[m])) {
                    selected_bills.remove(m);
                    found = true;
                    break;
                  }
                }

                if (!found) {
                  tmp_bills.push(curr_bills[k]);
                }
              }
              curr_bills = tmp_bills;
              selected_bills = [];
              resetTableRow();
              sOrderNoDel.val('');
              sBillNoDel.val('');
              setHtmlElementDisabled(btnDelete, true);
            });
          }
        });
      }
    });
  }

  function deleteOne(bill, afterDelete) {
    if (bill.status != '新建') {
      bootbox.alert('提单状态是' + bill.status + ',不能删除!');
    } else {
      bootbox.confirm('危险!您确定要删除这条提单? 删除后不能恢复!', function (result) {
        if (result) {
          ajaxRequestHandle('/delete_bill', 'POST', [bill], '单行删除', afterDelete);
        }
      });
    }
  }

  elementEventRegister(checkSelectAll, 'click', function() {
    if (curr_bills.length > 0) {
      if (checkSelectAll.prop("checked")) {
        $('.select-bill').prop("checked", true);
        selected_bills = curr_bills;
        setHtmlElementDisabled(btnDelete, false);
      } else {
        $('.select-bill').prop("checked", false);
        selected_bills = [];
        setHtmlElementDisabled(btnDelete, true);
      }
    }
  });
  /////////////////////////////////////////////////////
  // Modify function
  /////////////////////////////////////////////////////
  var iModTotalNum = $('#mod-total-number');
  var iModTotalWeight = $('#mod-total-weight');
  function showModifyForm() {
    $('#h_order_no').text(selectedBill.order_no);
    $('#h_order_item_no').text(selectedBill.order_item_no);
//    $('#h_bill_no').text(selectedBill.bill_no);

    $('#mod_len').text(selectedBill.len);
    $('#mod_width').text(selectedBill.width);
    $('#mod_thickness').text(selectedBill.thickness);

    var num = selectedBill.block_num;
    var left = selectedBill.left_num;
    if (!num) {
      $('#mod_num').text('无数据');
      $('#mod_ship_num').text('无');
    } else {
      $('#mod_num').text(num);
      $('#mod_ship_num').text(num - left);
    }

    $('#status').text(selectedBill.status);
    $('#create_date').text(selectedBill.create_date);//.yyyymmdd_cn());
    $('#shipping_date').text(selectedBill.shipping_date);//.yyyymmdd_cn());
    $('#settle_date').text(selectedBill.settle_date);//.yyyymmdd_cn());

    $('#mod-sale-dep').text(selectedBill.sales_dep);
    $('#mod-size-type').text(selectedBill.size_type);
    var checkStatus = (selectedBill.status == '已配发' || selectedBill.status == '已结算');
    if (selectedBill.block_num > 0) {
      showHtmlElement($('#mod-tot-num-grp'), true);
      showHtmlElement($('#mod-tot-weight-grp'), false);
      iModTotalNum.prop('disabled', checkStatus);
    } else {
      showHtmlElement($('#mod-tot-num-grp'), false);
      showHtmlElement($('#mod-tot-weight-grp'), true);
      iModTotalWeight.prop('disabled', checkStatus);
    }

//    if (checkStatus || selectedBill.status.lastIndexOf('已配发', 0) === 0) {

    $('#brand_no').val(selectedBill.brand_no);
    iBillingName.val(selectedBill.billing_name);
    iShipWarehouse.val(selectedBill.ship_warehouse);
    iContractNo.val(selectedBill.contract_no);
    iModTotalNum.val(selectedBill.block_num);

    var numOfSent = selectedBill.block_num - selectedBill.left_num;
    validIntInput(iModTotalNum, numOfSent == 0 ? 1 : numOfSent, 2000);

    iModTotalWeight.val(selectedBill.total_weight);
    var weightSend = selectedBill.total_weight - selectedBill.left_num;
    validFloatInput(iModTotalWeight, selectedBill.total_weight, weightSend);

    $('#mod-bill-no').val(selectedBill.bill_no);

    $('#single-modify-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  }

  elementEventRegister($('#single-modify'), 'click', function() {
    if (selectedBill) {
      showModifyForm();
    } else {
      bootbox.alert('请选择表中某一记录');
    }
  });

  elementEventRegister($('#single-modify-btn-ok'), 'click', function() {
    var changed = false;
    var bill_name = iBillingName.val();
    var contract_no = iContractNo.val();
    var ship_warehouse = iShipWarehouse.val();
    var bill_no = $('#mod-bill-no').val();
    if (!sameText(bill_no, selectedBill.bill_no)) {
      selectedBill.bill_no = bill_no;
      changed = true;
    }
    if (!sameText(bill_name, selectedBill.billing_name)) {
      selectedBill.billing_name = bill_name;
      changed = true;
    }
    if (!sameText(contract_no, selectedBill.contract_no)) {
      selectedBill.contract_no = contract_no;
      changed = true;
    }
    if (!sameText(ship_warehouse, selectedBill.ship_warehouse)) {
      selectedBill.ship_warehouse = ship_warehouse;
      changed = true;
    }
    var brandNo = getElementValue($('#brand_no'));
    if (!sameText(brandNo, selectedBill.brand_no)) {
      selectedBill.brand_no = brandNo;
      changed = true;
    }

    if (selectedBill.block_num > 0) {
      var num = parseInt(iModTotalNum.val());
      if (selectedBill.block_num != num) {
        var sent = selectedBill.block_num - selectedBill.left_num;
        selectedBill.block_num = num;
        selectedBill.left_num = num - sent;
        selectedBill.total_weight = toFixedNumber(num * selectedBill.weight, 3);

        if (selectedBill.left_num <= 0) {
          selectedBill.left_num = 0;
          selectedBill.status = '已配发';
        }
        changed = true;
      }
    } else if (selectedBill.total_weight > 0) {
      var w = parseFloat(iModTotalWeight.val());
      if (w > 0 && w != selectedBill.total_weight) {
        var sent_weight = selectedBill.total_weight - selectedBill.left_num;
        selectedBill.total_weight = w;
        selectedBill.left_num = w - sent_weight;
        if (selectedBill.left_num <= 0) {
          selectedBill.left_num = 0;
          selectedBill.status = '已配发';
        }
        changed = true;
      }
    }

    if (changed) {
      ajaxRequestHandle('/modify_bill/single', 'POST', selectedBill, '单行修改', function() {
        if (!isJqueryElementEmpty(data_tbody)) {
          var first = '',
              last = '';
          if (btnDelete.length || isModify) {
            first += '<td><input class="select-bill" type="checkbox"></td>';
            last += '<td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td>';
          } else {
            $('#action-button').hide();
            $('#delete-button').hide();
          }

          data_tbody.find('tr').eq(selectedIdx).html(first + makeTableBodyTr(selectedBill) + last);
        }

        $('#single-modify-dialog').modal('hide');
      });
    } else {
      $('#single-modify-dialog').modal('hide');
    }
  });

  elementEventRegister($('#batch-modify'), 'click', function() {
    if (selected_bills.length > 0) {
      batchModifyValues = [];
      unselected(sBatchModifyItem);
      iBatchModifyItemValue.val('');
      $('#batch-modify-info').html('');
      $('#batch-modify-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    } else {
      bootbox.alert('无数据可修改');
    }
  });

  var sBatchModifyItem = $('#batch-modify-item');
  var iBatchModifyItemValue = $('#batch-modify-item-value');
  var batchModifyValues = [];
  elementEventRegister(sBatchModifyItem, 'change', function() {
    iBatchModifyItemValue.val('');
  });

  elementEventRegister(iBatchModifyItemValue, 'keyup paste', function(e) {
    e.stopImmediatePropagation();
    var me = $(this);
    var me_value = $.trim(me.val());
    var itemSelected = sBatchModifyItem.find('option:selected');
    var item = itemSelected.text();
    var idx = itemSelected.index();
    if (idx >= 0) {
      batchModifyValues[idx] = {name: item, val: me_value};
      var text = '';
      batchModifyValues.forEach(function(value) {
        if (value.val) {
          if (value.name == '销售部门' || value.name == '尺寸') {
            text += '<span class="nl_label label-primary col-md-12">"' + value.name + '" 批量修改为:' + value.val + ' <label class="nl_label label-warning"> 注:只有在销售部门为A6,A8,B6,B8,E6,E8和尺寸为定尺时,才使用公式计算重量</label></span>';
          } else {
            text += '<span class="nl_label label-primary col-md-12">"' + value.name + '" 批量修改为:' + value.val + '</span>';
          }
        }
      });
      $('#batch-modify-info').html(text);
      setHtmlElementDisabled($('#batch-modify-btn-ok'), isEmpty(text));
    }
  });

  elementEventRegister($('#batch-modify-btn-ok'), 'click', function() {
    var weightFactorChanged = false;
    var billingNameUpdated = false;
    selected_bills.forEach(function (bill) {
      weightFactorChanged = false;
      batchModifyValues.forEach(function (value) {
        if (value.name == '牌号') {
          bill.brand_no = value.val;
        } else if (value.name == '开单名称') {
          bill.billing_name = value.val;
          billingNameUpdated = true;
        } else if (value.name == '发货仓库') {
          bill.ship_warehouse = value.val;
        } else if (value.name == '提单号') {
          bill.bill_no = value.val;
        } else if (value.name == '合同号') {
          bill.contract_no = value.val;
        } else if (value.name == '销售部门') {
          bill.sales_dep = value.val;
        } else if (value.name == '尺寸') {
          bill.size_type = value.val;
        } else if (value.name == '长度') {
          bill.len = value.val;
          weightFactorChanged = true;
        } else if (value.name == '宽度') {
          bill.width = value.val;
          weightFactorChanged = true;
        } else if (value.name == '厚度') {
          bill.thickness = value.val;
          weightFactorChanged = true;
        }
      });

      if (weightFactorChanged == true) {
        if (bill.block_num > 0) {
          var w = bill.len * bill.width * bill.thickness * 7.85 * Math.pow(10, -9);
          bill.weight = toFixedNumber(w, 3);
          bill.total_weight = toFixedNumber(bill.block_num * bill.weight, 3);
        }
      }
    });

    ajaxRequestHandle('/modify_bill/batch', 'POST', {bills: selected_bills, nameChanged: billingNameUpdated}, '批量修改', function() {
      resetTableRow();
      $('#batch-modify-dialog').modal('hide');
    });
  });

  $('#left-zero').on('click', function() {
    if (selected_bills.length > 0) {
      selected_bills.forEach(function (bill) {
        bill.total_weight -= bill.left_num;
        bill.left_num = 0;
        bill.status = '已配发';
      });

      ajaxRequestHandle('/modify_bill/batch', 'POST', {bills: selected_bills, nameChanged: false}, '剩余量清零修改', function () {
        resetTableRow();
      });
    } else {
      bootbox.alert('请选择要清零的记录！');
    }
  });

  /////////////////////////////////////////////////////
  // Search function
  /////////////////////////////////////////////////////
  $('#general-search').on('click', function() {
    $('#general-search-content').toggle();
  });

  $('#advance-search').on('click', function() {
    var searchHandler = new SearchHandlerD('bill');
    searchHandler.initial('/get_bills_by_condition');
    searchHandler.okEventHandler( function(result) {
      curr_bills = result.bills;
      resetTableRow();
      if (isExist(sBillNoDel) && sBillNoDel.length > 0) {
        sBillNoDel.select2("val", "");
        sOrderNoDel.select2("val", "");
      } else {
        sOrderNo.select2("val", "");
        sOrderItemNo.val('');
        sBillNo.val('');
      }
      $('#search_dialog').modal('hide');
    });

    $('#search_dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  });

  $('#left-search').on('click', function() {
    $('#left-search-weight').val('');
    $('#left-search-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  });

  $('#left-search-btn-ok').on('click', function() {
    var v = $('#left-search-weight').val();
    if (v > 0) {
      $.get('/get_bills_by_condition', { search_left: 1, left: parseFloat(v) }, function (data) {
        var result = JSON.parse(data);
        if (result.ok) {
          curr_bills = result.bills;
          resetTableRow();
          $('#left-search-dialog').modal('hide');
        } else if (result.number > 500) {
          bootbox.alert('当前查询结果 = ' + result.number + ', 数量太多（超过500个），请进一步限定条件！');
        } else {
          bootbox.alert("找不到您要找的数据,请确认您的查询条件!");
        }
      });
    }
  });

  var sheetName = 'sheet';
  elementEventRegister($('#search-export'), 'click', function() {
    saveToExcel(curr_bills, sheetName);
  });

  // icheck radio button 事件处理
  var shippingBillBox = $('#checkbox-shipping-bill');
  elementEventRegister(shippingBillBox, 'ifChecked', function() {
    sheetName = '已配发';
    var obj = { status: '已配发'  };
    $.get('/get_bills_by_condition', { q: JSON.stringify(obj), isNeedAnalysis: false }, function(data) {
      var result = JSON.parse(data);
      if (result.ok) {
        curr_bills = result.bills;
        resetTableRow();
      }
    });
  });

  elementEventRegister(shippingBillBox, 'ifUnchecked', function() {
    curr_bills = [];
    data_tbody.empty();
  });

  ///////////////////////////////////////////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////
  function resetTableRow() {
    data_tbody.empty();
    var first = '<tr>',
        last = '</tr>';
    if (btnDelete.length > 0 || isModify) {
      first = '<tr><td><input class="select-bill" type="checkbox"></td>';
      last = '<td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td></tr>';
    } else {
      $('#action-button').hide();
      $('#delete-button').hide();
    }

    var html_text = [];
    curr_bills.forEach(function (bill) {
      html_text.push(first + makeTableBodyTr(bill) + last);
    });
    data_tbody.append(html_text.join('\n'));

    var trs = data_tbody.find('tr');
    tr_click(trs, function (e, index) {
      selectedBill = curr_bills[index];
      selectedIdx = index;
    });

    trs.dblclick(function () {
      selectedBill = curr_bills[$(this).index()];
      selectedIdx = $(this).index();
      if ($('#single-modify').length > 0) {
        showModifyForm();
      } else if ($('#checkbox-shipping-bill').length > 0) { // 查询界面
        showWaybillData();
      }
    });

    $('.td-icon').on('click', function (e) {
      e.stopImmediatePropagation();
      var tr = $(this).closest('tr');
      var idx = tr.index();
      deleteOne(curr_bills[idx], function() {
        for (var i = 0; i < selected_bills.length; ++i) {
          if (sameBill(selected_bills[i], curr_bills[idx])) {
            selected_bills.remove(i);
            setHtmlElementDisabled(btnDelete, selected_bills.length === 0);
            break;
          }
        }

        tr.remove();
        curr_bills.remove(idx);
      });
    });

    $('.select-bill').on('click', function(e) {
      e.stopImmediatePropagation();
      var tr = $(this).closest('tr');
      var idx = tr.index();
      var b = curr_bills[idx];
      if ($(this).is(":checked")) {
        selected_bills.push(b);
        setHtmlElementDisabled(btnDelete, false);
        tr.addClass('selected-highlighted');
        tr.removeClass('invoice-highlighted');
      } else {
        for (var i = 0; i < selected_bills.length; ++i) {
          if (sameBill(selected_bills[i], b)) {
            selected_bills.remove(i);
            setHtmlElementDisabled(btnDelete, selected_bills.length === 0);
            break;
          }
        }
        tr.removeClass('selected-highlighted');
      }
    });
  }

  function makeTableBodyTr(bill) {
    var str = '<td style="text-align: center;">' + getStrByStatus(bill.status, bill.status) + "</td>";

    var vehs = [];
    for (var idx = 0; idx < bill.invoices.length; ++idx) {
      var veh = bill.invoices[idx].veh_ves_name;
      if (veh && vehs.indexOf(veh) < 0) {
        vehs.push(veh);
      }
    }
    if (vehs.length > 0) {
      str += '<td>' + vehs.join(',') + '</td>';
    } else {
      str += '<td></td>';
    }

    for (var i = 0; i < 22; ++i) {
      str += "<td>{" + i + "}</td>";
    }

    var dw = "";
    if (bill.block_num > 0) {
      dw = getStrValue(bill.weight);
    }

    return str.format(getOrder(bill.order_no, bill.order_item_no), bill.bill_no,
        bill.brand_no ? bill.brand_no : '', bill.billing_name,
        bill.sales_dep ? bill.sales_dep : '',
        getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len), bill.size_type, "",
        dw, bill.block_num, getStrValue(bill.total_weight),
        bill.ship_warehouse ? bill.ship_warehouse : '',
        bill.shipping_address ? bill.shipping_address : '',
        bill.contract_no ? bill.contract_no : '',
        date2Str(bill.create_date), date2Str(bill.shipping_date), date2Str(bill.settle_date),
        bill.creater ? bill.creater : '', bill.shipper ? bill.shipper : '', bill.settler ? bill.settler : '');
  }

  function showWaybillData() {
    if (selectedBill.invoices.length) {
      var inv_no = selectedBill.invoices[0].inv_no;
      $.get('/get_waybill', { q: inv_no }, function (data) {
        var obj = jQuery.parseJSON(data); // bills: bills, invoices: invoices
        var selectedWaybill = obj.invoices[0];
        setElementValue($('#report-bill-name'), selectedWaybill.ship_name);
        setElementValue($('#report-ship-to'), selectedWaybill.ship_to);
        setElementValue($('#report-waybill-no'), selectedWaybill.waybill_no);
        var allBills = [];
        selectedWaybill.bills.forEach(function(b) {
          obj.bills.forEach(function(b1) {
            if (String(b.bill_id) === String(b1._id)) {
              allBills.push(b1);
              if (b1.block_num > 0) {
                b1.wnum = b.num;
              } else {
                b1.wnum_danding = b.num;
                b1.wnum = b.weight;
              }
            }
          })
        });
        $('#report-table').html(getTableHtml(allBills));

        var tn = 0;
        selectedWaybill.bills.forEach(function(b) {
          tn += b.num;
        });
        setElementValue($('#report-total-weight'), toFixedStr(selectedWaybill.total_weight, 3));
        setElementValue($('#report-total-number'), tn);
        $('#show-invoice-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
      });
    }
  }
});

function getTableHtml(allBills) {
  var html = [ ];
  var num, w, tw;
  html.push('<thead><tr><th>提单号</th><th>订单号</th><th>牌号</th><th>厚度</th><th>宽度</th><th>长度</th><th>单重</th><th>发运数</th><th>发运重量</th><th>仓库</th><th>合同号</th></tr></thead>');
  var str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>';
  allBills.forEach(function(b) {
    if (b.block_num > 0) {
      num = getStrValue(b.wnum);
      w = getStrValue(b.weight);
      tw = getStrValue(b.weight * b.wnum);
    } else {
      num = getStrValue(b.wnum_danding);
      w = '';
      tw = getStrValue(b.wnum);
    }
    html.push(str.format(b.bill_no, getOrder(b.order_no, b.order_item_no), b.brand_no ? b.brand_no : "",
        getStrValue(b.thickness), getStrValue(b.width), getStrValue(b.len), w, num, tw,
        b.ship_warehouse? b.ship_warehouse : "", b.contract_no ? b.contract_no : ""));
  });

  return html.join('');
}

function getBillsByNo(bills, data) {
  var res = [];
  if (bills.length > 0) {
    if (data.order_no) {
      bills.forEach(function (bill) {
        if (bill.order_no == data.order_no) {
          res.push(bill);
        }
      });
    } else if (data.item_no) {
      bills.forEach(function (bill) {
        if (bill.order_item_no == data.item_no) {
          res.push(bill);
        }
      });
    } else if (data.bill_no) {
      bills.forEach(function (bill) {
        if (bill.bill_no == data.bill_no) {
          res.push(bill);
        }
      });
    }
  }

  return res;
}

function validFloatInput(elem, initValue, minValue) {
  elem.data("new", initValue);
  elem.ForceNumericOnly();
  elem.on('keyup paste', function(e) {
    $(this).data("old", $(this).data("new") || "");
    var v = $(this).val();
    if (!isNumeric(v)) {
      $(this).val($(this).data("old"));
      $(this).data("new", $(this).val());
    } else {
      if (v < minValue) {
        v = minValue;
      }
      $(this).data("new", v);
      $(this).val(v);
    }
  });
}

function validIntInput(elem, min, max) {
  elem.ForceNumericOnly();
  elem.on('keyup paste', function(e) {
    numberIntValider(elem, min, max);
  });
}

function sameText(src, dst) {
  var b1 = isEmpty(src);
  var b2 = isEmpty(dst);
  if (!b1 && !b2) {
    return src == dst;
  } else if (b1 && b2) {
    return true;
  } else {
    return false;
  }
}