$(function () {
  "use strict";

  var vswLabel      = $('#vehicle-ship-weight');
  var btnNew        = $('#invoice_new');
  var btnSave       = $('#invoice_save');
  var btnSaveShip   = $('#invoice_save_shipping');
  var invInputUI    = $('#invoice-input-content');
  var invoiceBody   = $('#invoice_tbody');
  var sVehicleName  = $('#vehicle_name');
  var sShipName     = $('#ship_name');      // 开单名称
  var sShipCustomer = $('#ship_customer');  // 发货单位
  var iShipTo       = $('#ship_to_input');
  var sShipTo       = $('#ship-to-select');
  var sShipFrom     = $('#start-warehouse');
  var iShipDateGrp  = $('#ship-date-grp');
  var lTotalWeight  = $('#total_weight_td');
  var lTotalNumber  = $('#total_number_td');
  var sBillNo       = $('#bill_no');
  var sOrderNo      = $('#order_no_by_name');

  var vehicleNo   = $('#vehicle-no');
  var el_origin   = $('#origin');
  var vehShipCfm  = $('#vehicle-ship-confirm');
  var reportTable = $('#report-table');
  var sWaybillNo  = $('#waybill_no_query');

  var curr_invoice_state = 'idle'; // idle -> new/open -> save -> idle
  var username = local_user.userid;
  var dictData = local_dict_data;
  var action = local_action;

  var cNumIdx = 10; // const for num input
  var waybillNo = '';
  var innerWaybillNoOrder = 0;
  var selectedWaybill = null;
  var totalWeight = 0, totalNumber = 0;
  var vehTotShipNum = 0, vehTotShipWeight = 0;

  waybillHandler.init('');

  if (sWaybillNo.length) {
    select2Setup(sWaybillNo, {inputLength: 4, placeholder: '查找运单号', url: '/get_waybill'}, function (data) {
      waybillHandler.setQueryData(data);
    });
  }

  if (iShipDateGrp.length) {
    iShipDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change change', saveButtonAvailable);
  }

  var myWaybillQuery = $('#my_waybill_query');
  var checkWaybillMe = $('#checkWaybillForMe');
  if (checkWaybillMe.length) {
    checkWaybillMe.iCheck('uncheck');
  }

  var isVessel = false; // 使用船来配发
  var allVehicles = [];

  if (!isEmpty(dictData) && action !== "REPORT") {
    dictData.warehouse = sort_pinyin(dictData.warehouse);
    dictData.destination = sort_pinyin(dictData.destination);
    initSelect(sShipFrom, dictData.warehouse, false);
    initSelect(sShipTo, dictData.destination, false);
    initSelect(el_origin, dictData.warehouse, false);
    el_origin.select2();
    el_origin.select2('val', '南钢');
    sShipFrom.select2();
    sShipFrom.select2('val', '');
    sShipTo.select2();
    sShipTo.select2('val', '');

    dictData.vehInfo.forEach(function (vehicle) {
      if (vehicle.veh_type === '车') {
        allVehicles.push(vehicle.name);
      }
    });

    allVehicles = sort_pinyin(allVehicles);
    initSelect(vehicleNo, allVehicles, false);
    vehicleNo.select2();
    sBillNo.select2();
    sOrderNo.select2();
  }

  initAllHtmlElements(); // initial element value

  /*
   * Ship Invoice Function
   */
  var inputForShipTo = false;
  if (action === "ADD" || action === "MODIFY") {
    var route = '/build_invoice';
    if (action === "ADD") {
      if (!isEmpty(dictData)) {
        initSelect(sShipName, sort_pinyin(getAllList(false, dictData.company, "name")), false);
        initSelect(sVehicleName, sort_pinyin(dictData.vehicles), false);
        sVehicleName.select2();
        sShipName.select2();
      }

      elementEventRegister(btnNew, 'click', function () {
        if (!btnSave.hasClass('disabled')) {
          bootbox.confirm('有数据未保存, 确定要重新创建一个运单?', function (result) {
            if (result) {
              create_invoice();
            }
          });
        } else if (curr_invoice_state !== 'idle') {
          bootbox.confirm('确定要重新创建运单?', function (result) {
            if (result) {
              create_invoice();
            }
          });
        } else {
          create_invoice();
        }
      });

      elementEventRegister(sShipName, 'change', function () {
        $(this).data("old", $(this).data("new") || "");

        var oldName = $(this).data('old');
        var name = this.value;
        if ((totalNumber > 0 && totalWeight > 0) || waybillHandler.hasSelectedBills()) {
          bootbox.confirm('开单名称的改变将导致所有的您选择的提单数据丢失,确认吗?', function (result) {
            if (result) {
              handlerReset(name);
            } else {
              sShipName.select2('val', oldName);
            }
          })
        } else {
          handlerReset(name);
        }

        $(this).data("new", name);
      });

      elementEventRegister(sVehicleName, 'change', function () {
        var me = $(this);
        me.data("old", me.data("new") || "");   // save old value first

        var isVessel_tmp = getVesselFlag(this.value);
        if (isVessel !== isVessel_tmp) { // 车到船 或船到车
          isVessel = isVessel_tmp;
          showHtmlElement($('#inv-table-input th:last-child, #inv-table-input td:last-child'), isVessel);
          showHtmlElement($('#vehicle-info'), (action !== "REMOVE" && isVessel));

          if (!isVessel_tmp) { // 船-->车
            if (innerWaybillNoOrder > 0) { // 之前confirm过
              bootbox.confirm("你之前选择的是船,现在选择的车,针对每个提单的车号信息都会被清空,确定改变吗?", function (result) {
                if (result) {
                  waybillHandler.clearVehicles(waybillNo);
                  $('td[name="wagon_no"]').text('');
                  initVehicleElem();
                } else {
                  showHtmlElement($('#inv-table-input th:last-child, #inv-table-input td:last-child'), true);
                  showHtmlElement($('#vehicle-info'), (action !== "REMOVE"));
                  $('#lb-vehicle').text('船号');
                  isVessel = true;

                  me.val(me.data("old"));
                  me.data("new", me.val());
                }
              })
            } else {
              waybillHandler.clearVehicles(waybillNo);
              $('td[name="wagon_no"]').text("");
            }
          } else {  // 车->船
            initVehicleElem();
            if (curr_invoice_state === "saved") { // 之前已经保存过, 请为它们输入车号
              var inner_id = waybillNo + leftPad(innerWaybillNoOrder, 3);
              waybillHandler.showSelectedBill(
                inner_id,
                function (bill, total, num, weight) {
                  vehTotShipNum += num;
                  vehTotShipWeight += weight;
                  invoiceBody.append(buildTableTr(bill, total, bill.left, num, weight) + getVehTableData("wagon_no") + '</tr>');
                },
                function () {
                  invoiceBodyEventRegister();
                  updateHeadText(false);
                  showTotalWeightNumber();
                  saveButtonAvailable();
                });
            }
          }
        } else if (isVessel_tmp) { // 不同的船变化
          // 之前所以配置的提单信息都丢失, 类似于从新开始
        }

        saveButtonAvailable();
        me.data("new", me.val());
      });
    } else {
      route = '/distribute_invoice';
    }

    elementEventRegister(btnSave, 'click', function () {
      if (selectedWaybill && (selectedWaybill.state === '已结算')) {
        bootbox.alert('此运单已结算,不能修改保存!');
      } else {
        buildDataAndSave('新建', route, '保存配发货/登记');
      }
    });

    elementEventRegister(btnSaveShip, 'click', function () {
      if (selectedWaybill && (selectedWaybill.state === '已结算')) {
        bootbox.alert('此运单已结算,不能修改配发!');
      } else {
        bootbox.confirm('确定配发当前选择的订单?', function (result) {
          if (result) {
            buildDataAndSave('已配发', route, '保存并确定配发');
          }
        });
      }
    });

    elementEventRegister(iShipTo, 'keyup paste', saveButtonAvailable);
    elementEventRegister(sShipTo, 'change', saveButtonAvailable);
    elementEventRegister($('#lbl-ship-to'), 'click', function () {
      iShipTo.toggle();
      //sShipTo.toggle();
      showHtmlElement($('#s2id_ship-to-select'), inputForShipTo);
      inputForShipTo = !inputForShipTo;
      iShipTo.val('');
      sShipTo.select2('val', '');
      saveButtonAvailable();
    });

    elementEventRegister(sOrderNo, 'change', function () {
      var res = waybillHandler.findCreate(this.value, false);
      if (res.found) {
        sBillNo.empty();
        res.data.getOptions(sShipName.val()).forEach(function (option) {
          sBillNo.append(option);
        });

        sBillNo.select2('val', '');
      }
    });

    elementEventRegister(sBillNo, 'change', function () {
      var inner_id = isVessel ? (waybillNo + leftPad(innerWaybillNoOrder, 3)) : '';
      var order_no = sOrderNo.val();
      var bill_no = sBillNo.val();
      var result = waybillHandler.addAndInsertTable(order_no, bill_no, inner_id);
      if (result && result.bills.length) {
        result.bills.forEach(function (bill) {
          appendInvoiceBody(bill, 0, false)
        });

        var trs = invoiceBody.find('tr');
        trs.removeClass('selected-highlighted');

        var numOfBill = result.bills.length;
        for (var i = 0; i < trs.length; ++i) {
          var tr = getRowChildren(invoiceBody, i);
          var bno = getTableCellChildren(tr, 1).text();
          var ono = getTableCellChildren(tr, 2).text();
          for (var k = 0; k < numOfBill; ++k) {
            if (bno === result.bills[k].bill_no && ono === getOrder(result.bills[k].order_no, result.bills[k].order_item_no)) {
              tr.addClass('selected-highlighted');
              break;
            }
          }
        }

        invoiceBodyEventRegister();

        updateUIElem(true, true, order_no, bill_no, result.tip, result.billtips);
      }
    });

    elementEventRegister(sShipFrom, 'change', saveButtonAvailable); // 车辆始发处理
    elementEventRegister(sShipCustomer, 'change', saveButtonAvailable);

    elementEventRegister(vehicleNo, 'change', function () {
      $(this).data("old", $(this).data("new") || '');
      var oldV = $(this).data("old");
      var value = this.value;
      $(this).data("new", value);

      var td = action === 'ADD' ? $('td[name="wagon_no"]') : $('td[name="wagon_no_new"]');
      if (vehTotShipNum > 0) {
        if (oldV) {
          var s = '车辆号:"' + oldV + '"还没确定配发完成, 如果更换车辆号,之前的这辆车的配发数据无效并被丢失, 确定吗?';
          bootbox.confirm(s, function (result) {
            if (result) {
              td.text(value);
              setHtmlElementDisabled(vehShipCfm, (vehTotShipNum <= 0 || isEmpty(value)));
            } else {
              vehicleNo.select2('val', oldV);
              $(this).data("new", oldV);
            }
          })
        } else {
          td.text(value);
          setHtmlElementDisabled(vehShipCfm, (vehTotShipNum <= 0 || isEmpty(value)));
        }
      } else {
        td.text(value);
        var numOfRow = invoiceBody.find("tr").length;
        if (numOfRow > 0) {
          for (var i = 0; i < numOfRow; ++i) {
            var tr = getRowChildren(invoiceBody, i);
            var tdAttr = tr.find("td:last").attr("name");
            if (tdAttr === "wagon_no" || tdAttr === "wagon_no_new") {
              var data = getNumAndWeight(tr);
              vehTotShipNum += data.num;
              vehTotShipWeight += data.weight;
            }
          }

          showTotalWeightNumber();
        } else {
          initVehicleElem();
        }
      }
    });

    // 运船: 一车配送确定
    elementEventRegister(vehShipCfm, 'click', function () {
      if (!checkNumWeightInput()) {
        bootbox.alert("请完成发运块数和发运重量的输入!");
      } else {
        var vno = vehicleNo.val();

        waybillHandler.handleVehicleComplete(waybillNo + leftPad(innerWaybillNoOrder, 3), vno, el_origin.val());

        if (action === "ADD") {
          invoiceBody.empty();
        } else { // Modify
          $('td[name="wagon_no_new"]').attr("name", "wagon_no_confirm");
          invoiceBody.find('tr').removeClass('selected-highlighted');
        }

        sBillNo.select2('val', '');
        vehicleNo.select2('val', '');
        vehicleNo.data("old", "");
        vehicleNo.data("new", "");

        waybillHandler.insertSelectOptions(sOrderNo, null);
        initVehicleElem();

        ++innerWaybillNoOrder; // 内部运单递增

        bootbox.alert('车辆: "' + vno + '"配发完成!');
      }
    });
  }
  else if (action === 'REPORT') {
    $.extend($.tablesorter.defaults, {theme: 'blue'});
    reportTable.tablesorter({widgets: ['stickyHeaders']});

    $('#lbl-destination').on('click', function () {
      showEditDialog('目的地', $('#report-ship-to'), function () {
        setElementValue($('#report-shipto-phone'), getElementValue($('#phone')));
        setElementValue($('#report-shipto-contact'), getElementValue($('#contact')));
      });
    });

    $('#lbl-bill-name').on('click', function () {
      showEditDialog('发货单位', $('#report-bill-name'), function () {
        setElementValue($('#report-bill-phone'), getElementValue($('#phone')));
      });
    });

    elementEventRegister($('#report-print'), 'click', function () {
      var rt = $('#report-tool');
      var ft = $('#footer');
      rt.toggle();
      ft.toggle();
      window.print();
      rt.toggle();
      ft.toggle();
    });

    elementEventRegister($('#report-export'), 'click', function () {
      var bills = waybillHandler.getBillsFromInvoice(selectedWaybill);
      var customer = selectedWaybill.ship_customer;
      if (isEmpty(customer)) {
        customer = selectedWaybill.ship_name;
      }
      var str = '';
      if (isVessel) {
        str = '<table><tr><th colspan="12">南京鑫鸿图储运有限公司发货单</th>';
        str += '<tr><td colspan="3">运单号：' + selectedWaybill.waybill_no + '</td><td colspan="6">开单名称:' + selectedWaybill.ship_name + '</td><td colspan="3" align="right">目的地:' + selectedWaybill.ship_to + '</td></tr>';
        str += '<tr><td colspan="3">车船号：' + selectedWaybill.vehicle_vessel_name + '</td><td colspan="6">发货单位:' + customer + '</td><td colspan="3" align="right">电话:' + $('#report-shipto-phone').text() + '</td>';
        str += '<tr><td colspan="3">发货日期：' + $('#report-ship-date').text() + '</td></td><td colspan="6">电话:' + $('#report-bill-phone').text() + '</td><td colspan="3" align="right">联系人:' + $('#report-shipto-contact').text() + '</td></tr>';
        str += '<tr><td colspan="3">始发地: ' + $('#report-ship-from').text() + '</td><td colspan="9"></td></tr>';
        str += '<tr><td colspan="3">车船电话: ' + $('#report-ship-phone').text() + '</td><td colspan="9"></td></tr><tr><td colspan="12"></td></tr>';
        str += '<tr><th>提单号</th><th>订单号</th><th>牌号</th><th>厚度</th><th>宽度</th><th>长度</th><th>单重</th><th>发运数</th><th>发运重量</th><th>仓库</th><th>合同号</th><th>车号</th></tr>';
        str += getTableHtml(bills) + '<tr><td colspan="12"></td></tr>';
        str += '<tr><th colspan="10" align="right">总重量:</th><th colspan="2" align="left">' + $('#report-total-weight').text() + '</th></tr>';
        str += '<tr><th colspan="10" align="right">总块数:</th><th colspan="2" align="left">' + $('#report-total-number').text() + '</th></tr></table>';
      } else {
        str = '<table><tr><th colspan="11">南京鑫鸿图储运有限公司发货单</th>';
        str += '<tr><td colspan="3">运单号：' + selectedWaybill.waybill_no + '</td><td colspan="5">开单名称:' + selectedWaybill.ship_name + '</td><td colspan="3" align="right">目的地:' + selectedWaybill.ship_to + '</td></tr>';
        str += '<tr><td colspan="3">车船号：' + selectedWaybill.vehicle_vessel_name + '</td><td colspan="5">发货单位:' + customer + '</td><td colspan="3" align="right">电话:' + $('#report-shipto-phone').text() + '</td>';
        str += '<tr><td colspan="3">发货日期：' + $('#report-ship-date').text() + '</td></td><td colspan="5">电话:' + $('#report-bill-phone').text() + '</td><td colspan="3" align="right">联系人:' + $('#report-shipto-contact').text() + '</td></tr>';
        str += '<tr><td colspan="3">始发地: ' + $('#report-ship-from').text() + '</td><td colspan="8"></td></tr>';
        str += '<tr><td colspan="3">车船电话: ' + $('#report-ship-phone').text() + '</td><td colspan="8"></td></tr><tr><td colspan="12"></td></tr>';
        str += '<tr><th>提单号</th><th>订单号</th><th>牌号</th><th>厚度</th><th>宽度</th><th>长度</th><th>单重</th><th>发运数</th><th>发运重量</th><th>仓库</th><th>合同号</th><th>车号</th></tr>';
        str += getTableHtml(bills) + '<tr><td colspan="11"></td></tr>';
        str += '<tr><th colspan="9" align="right">总重量:</th><th colspan="2" align="left">' + $('#report-total-weight').text() + '</th></tr>';
        str += '<tr><th colspan="9" align="right">总块数:</th><th colspan="2" align="left">' + $('#report-total-number').text() + '</th></tr></table>';
      }
      tableToExcel(str, selectedWaybill.waybill_no, "运单数据" + date2Str(new Date()) + ".xls");
    });
  }

  function create_invoice() {
    $.get('/get_max_waybill_no', {}, function (data) {
      var result = JSON.parse(data);
      if (result.ok) {
        waybillNo = result.max_no;
        innerWaybillNoOrder = 0;
        selectedWaybill = null;
        curr_invoice_state = 'new';

        waybillHandler.reset('');

        showHtmlElement($('#inv-head-info'), true);
        $('#waybill_oper_text').text('新建运单号: ');
        $('#waybill_no').text(waybillNo);
        showHtmlElement(invInputUI, true);

        initAllHtmlElements();
        sVehicleName.prop("disabled", false);
        sShipName.prop("disabled", false);
      } else {
        bootbox.alert('新建失败:' + result.response);
      }
    })
  }

  /////////////////////////////////////////////////////////////////////////////
  // MY waybill check event handling 
  /////////////////////////////////////////////////////////////////////////////
  elementEventRegister(checkWaybillMe, 'ifChecked', function () {
    showHtmlElement($('#div-my-select'), true);
    showHtmlElement($('#div-select2'), false);
    var today = new Date();
    var before = new Date(today.setDate(today.getDate() - 21));
    var obj = {
      $and: [{ship_date: {$gt: before}}, {
        $or: [
          {shipper: username},
          {username: username}
        ]
      }]
    };

    $.get('/get_invoices_by_condition', {q: JSON.stringify(obj), isNeedAnalysis: false}, function (data) {
      var result = JSON.parse(data);
      if (result.ok) {
        waybillHandler.setQueryData(result);

        myWaybillQuery.empty();
        $.each(result.invoices, function (index, inv) {
          myWaybillQuery.append("<option value='" + inv.waybill_no + "'>" + inv.waybill_no + "</option>");
        });

        unselected(myWaybillQuery);
      } else {
        bootbox.alert('查询数据库有误！');
      }
    })
  });

  elementEventRegister(checkWaybillMe, 'ifUnchecked', function () {
    showHtmlElement($('#div-my-select'), false);
    showHtmlElement($('#div-select2'), true);
  });

  elementEventRegister(myWaybillQuery, 'change', function () {
    selectWaybill(this.value);
  });

  elementEventRegister(sWaybillNo, 'change', function (e) {
    if (e.added) {
      selectWaybill(e.added.text);
    }
  });

  //////////////////////////////////////////////////////////////////////
  // Search function handle
  //////////////////////////////////////////////////////////////////////
  elementEventRegister($('#invoice_search'), 'click', function () {
    var searchHandler = new SearchHandlerD('invoice');
    searchHandler.initial('/get_invoices_by_condition');
    searchHandler.okEventHandler(function (result, selectedIdx) {
      selectedWaybill = waybillHandler.resetWithQueryData(result, selectedIdx);
      waybillNo = selectedWaybill.waybill_no;
      innerWaybillNoOrder = 0;

      $('#search_dialog').modal('hide');

      if (action === "ADD") { // 在配发界面
        waybillHandler.openToNew = true;
        showHtmlElement($('#inv-head-info'), true);
        $('#waybill_oper_text').text('打开运单号: ');
        $('#waybill_no').text(waybillNo);
      }
      else if (sWaybillNo.length) {
        sWaybillNo.select2("val", waybillNo);
        myWaybillQuery.val(waybillNo);
      }

      showWaybillData();
    });

    $('#search_dialog').modal({backdrop: 'static', keyboard: false}).modal('show');
  });

  elementEventRegister($('#waybill_delete'), 'click', function () {
    if (selectedWaybill && waybillNo) {
      if (selectedWaybill.state === '已结算') {
        bootbox.alert('此运单已结算,不能删除!');
      } else {
        bootbox.confirm('您确定要删除吗?', function (result) {
          if (result) {
            ajaxRequestHandle('/delete_invoice', 'POST', selectedWaybill, '运单删除:' + waybillNo, function () {
              waybillHandler.reset('');
              selectedWaybill = null;
              waybillNo = '';

              myWaybillQuery.find('[value="' + waybillNo + '"]').remove();
              initAllHtmlElements();
            });
          }
        })
      }
    }
  });


  // 开单名称改变处理
  function handlerReset(shipName) {
    $.get('/get_bill_by_name', {q: shipName}, function (data) {
      var obj = jQuery.parseJSON(data);

      waybillHandler.reset(shipName);

      obj.bills.forEach(function (b) {
        waybillHandler.addBill(b)
      });

      waybillHandler.insertSelectOptions(sOrderNo, shipName);

      sOrderNo.select2('val', '');
      sBillNo.select2('val', '');

      for (var i = 0; i < dictData.company.length; ++i) {
        if (shipName === dictData.company[i].name) {
          initSelect(sShipCustomer, dictData.company[i].customers, false);
          break;
        }
      }

      initInvoiceBody();
    });
  }

  function checkNumWeightInput() {
    for (var i = 0, len = invoiceBody.find("tr").length; i < len; ++i) {
      var tr = getRowChildren(invoiceBody, i);
      var td = getTableCellChildren(tr, cNumIdx + 1);
      if (td.find("input").length) {
        var num = (+getTableCellChildren(tr, cNumIdx).find("input").val());
        var weight = (+td.find("input").val());
        if ((num > 0 && weight === 0) || (num === 0 && weight > 0)) {
          return false;
        }
      }
    }

    return true;
  }

  var saving = true;

  /*
   * save data and reset UI
   */
  function buildDataAndSave(status, route, msg) {
    if (isVessel) {
      if (vehTotShipNum > 0) {
        bootbox.alert("车号:" + vehicleNo.val() + "未确定配发完毕, 保存前请确定.");
        return;
      } else {
        for (var i = 0, len = invoiceBody.find("tr").length; i < len; ++i) {
          var tr = getRowChildren(invoiceBody, i);
          if (isEmpty(tr.find('td:last-child').text())) {
            bootbox.alert("由于你选择了船发运, 请为每个提单选择船发运相对应的车辆号, 否则不能保存!");
            return;
          }
        }
      }
    }

    if (!checkNumWeightInput()) {
      bootbox.alert("请输入发运块数和发运重量,两者缺一不可, 否则不能保存!");
      return;
    }

    if (!waybillNo) {
      bootbox.alert("运单号为空，不能保存!"); return;
    }

    var el = status === '新建' ? btnSave : btnSaveShip;
    el.prop('disabled', true);

    if (saving) {
      console.log('saving ....')
      saving = false;
      var selectedBills = waybillHandler.getSelectedBills();
      var data = {
        waybill_no: waybillNo,
        vehicle_vessel_name: sVehicleName.val(),
        ship_name: sShipName.val(),
        ship_customer: sShipCustomer.val(),
        ship_from: sShipFrom.val(),
        ship_to: inputForShipTo ? iShipTo.val() : sShipTo.val(),
        ship_date: iShipDateGrp.data("DateTimePicker").getDate(),
        bills: selectedBills.slice(0),
        total_weight: totalWeight,
        username: username,
        shipper: username,
        state: status
      };

      ajaxRequestHandle(route, 'POST', data, msg, function () {
        waybillHandler.saveInvoice(data);
        waybillHandler.insertSelectOptions(sOrderNo, waybillHandler.shipName);

        if (action === 'ADD') {
          invoiceBody.empty();
        }

        sBillNo.select2('val', '');

        if (status === '已配发') {
          selectedWaybill = undefined;
          waybillNo = "";
          waybillHandler.reset('');
          isVessel = false;
          invInputUI.toggle();
          initAllHtmlElements();

          if (action === 'MODIFY') {
            sWaybillNo.select2("val", "");
            myWaybillQuery.val('');
          } else {
            $('#waybill_no').text(waybillNo);
            curr_invoice_state = 'idle';
          }
        } else {
          setHtmlElementDisabled(btnSave, true);
          curr_invoice_state = 'saved';
        }

        el.prop('disabled', false);
        saving = true;
      });
    } else {
      console.log("cannot click it")
    }

    setTimeout(function() {
      saving = true;
    }, 1500)
  }

  function getNumAndWeight(tr) {
    var td = getTableCellChildren(tr, cNumIdx + 1);
    return {
      num: (+getTableCellChildren(tr, cNumIdx).find('input').val()),
      weight: td.find('input').length ? (+td.find('input').val()) : (+td.text())
    }
  }

  function updateHeadText(needVehicleInfo) {
    if (needVehicleInfo) {
      showHtmlElement($('#inv-table-input th:last-child, #inv-table-input td:last-child'), isVessel);
      showHtmlElement($('#vehicle-info'), (action === "REMOVE") ? false : isVessel);
    }

    var res = waybillHandler.hasMixedBill();
    var t1 = '实际块数';
    var t2 = '剩余块数';
    if (res === 2) {
      t1 = '实际重量';
      t2 = '剩余重量';
    } else if (res === 3) {
      t1 = '实际块数/重量';
      t2 = '剩余块数/重量';
    }

    $('#real-head-text').text(t1);
    $('#left-head-text').text(t2);
  }

  function buildTableTr(bill, total, left, send_num, send_weight) {
    var dw = (bill.block_num > 0) ? getStrValue(bill.weight) : "";
    var str = '<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td align="center">{7}</td><td align="center">{8}</td>'
      .format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.ship_warehouse ? bill.ship_warehouse : "",
      getStrValue(bill.thickness), getStrValue(bill.width), getStrValue(bill.len),
      dw, getStrValue(total), getStrValue(left));

    if (bill.block_num > 0) {
      str += '<td><input type="text" name="ship_number" data-toggle="tooltip" title="最大可用块数:{0}, 剩余块数:{1}" class="ship-num form-control" value="{2}"/></td>'.format(bill.left, left, send_num);
      str += '<td align="center">' + getStrValue(send_weight) + '</td>';
    } else {
      str += '<td><input type="text" name="ship_number" class="ship-num form-control" value="' + send_num + '"/></td>';
      str += '<td><input type="text" name="ship_weight" data-toggle="tooltip" title="最大可用重量:{0}, 剩余重量:{1}" class="ship-num form-control" value="{2}"/></td>'.format(getStrValue(bill.left), left, getStrValue(send_weight));
    }

    return str;
  }

  function makeVehSelect(name, veh_name) {
    var wagonNoSelect = '<select disabled style="width: 100%" name="' + name + '">';
    if (isEmpty(veh_name)) {
      wagonNoSelect += '<option selected disabled hidden value=""></option>';
    }

    allVehicles.forEach(function (vname) {
      wagonNoSelect += '<option ' + (vname === veh_name ? 'selected' : '') + '>' + vname + '</option>';
    });

    return wagonNoSelect + '</select>';
  }

  function getVehTableData(attrName) {
    var vehNo = vehicleNo.val();
    var wid = waybillNo + leftPad(innerWaybillNoOrder, 3);
    return '<td align="center" title="' + wid + '" name="' + attrName + '">' + (vehNo ? vehNo : "") + '</td>';
  }

  function findSameTr(bill, needVehicles, onlyForFind) {
    var numOfRow = invoiceBody.find("tr").length;// $('#invoice_tbody tr').length;
    var trs = [];
    for (var i = 0; i < numOfRow; ++i) {
      var tr = getRowChildren(invoiceBody, i);
      var b = getTableCellChildren(tr, 1).text();
      var o = getTableCellChildren(tr, 2).text();
      if (bill.bill_no === b && getOrder(bill.order_no, bill.order_item_no) === o) {
        if (needVehicles && isVessel) {
          if (bill.vehicles && bill.vehicles.length) {
            var nw = getNumAndWeight(tr);
            var veh = tr.find('td:last').find('select').val();
            var found = false;
            bill.vehicles.forEach(function (bveh) {
              var wid = bveh.inner_waybill_no.substring(0, 17);
              if (!found && wid === selectedWaybill.waybill_no && nw.num === bveh.send_num && veh === bveh.veh_name) {
                found = true;
                trs.push(tr);
              }
            })
          }
        } else {
          trs.push(tr);
        }

        if (onlyForFind && trs.length) {
          return trs;
        }
      }
    }

    return trs;
  }

  function appendInvoiceBody(bill, num, initial) {
    if (!isVessel && findSameTr(bill, true, true).length) {
      return; // exist same record and return
    }

    var left = bill.left - num;
    var total = (bill.block_num > 0) ? bill.block_num : bill.total_weight;
    var send_num = 0, send_weight = 0;
    var html = "";

    if (action === "ADD" || action === "REMOVE" || (action === 'MODIFY' && !isVessel)) {
      if (bill.block_num > 0) {
        send_num = num;
        send_weight = num * bill.weight;
      } else {
        if (action === "ADD") {
          send_num = 0;
        } else {
          send_num = bill.prev_wnum_danding + bill.wnum_danding;
        }

        send_weight = num;
      }

      totalNumber += send_num;
      totalWeight += (+send_weight);

      html = buildTableTr(bill, total, left, send_num, send_weight);
      if (isVessel) {
        if (action === "REMOVE") {
          var s = "<td>";
          bill.vehicles.forEach(function (bveh) {
            var wid = bveh.inner_waybill_no.substring(0, 17);
            if (wid === selectedWaybill.waybill_no) {
              s += "<span>" + bveh.veh_name + "</span> <code>" + bveh.send_num + "</code><br />";
            }
          });
          html += s + "</td></tr>";
        } else {
          html += getVehTableData("wagon_no") + "</tr>";
          vehTotShipNum += send_num;
          vehTotShipWeight += (+send_weight);
        }
      } else {
        html += "<td></td></tr>";
      }

      invoiceBody.prepend(html);
    } else { // MODIFY with isVessel true
      if (initial) {
        bill.vehicles.forEach(function (bveh) {
          var wid = bveh.inner_waybill_no.substring(0, 17);
          if (wid === selectedWaybill.waybill_no) {
            send_num = bveh.send_num;
            send_weight = (bill.block_num > 0) ? send_num * bill.weight : bveh.send_weight;
            totalNumber += send_num;
            totalWeight += (+send_weight);
            html = buildTableTr(bill, total, left, send_num, send_weight) + '<td title="' + bveh.inner_waybill_no + '">' + makeVehSelect("wagon_no_init", bveh.veh_name) + "</td></tr>";
            invoiceBody.append(html);
          }
        });
      } else {
        html = buildTableTr(bill, total, bill.left_num, 0, 0);
        invoiceBody.prepend(html + getVehTableData("wagon_no_new") + "</tr>");
      }
    }
  }

  function updateLeftNumberCol(bill) {
    var result = findSameTr(bill, false, false);
    if (result.length) {
      var lnStr = getStrValue(bill.left_num);
      result.forEach(function (foundTr) {
        getTableCellChildren(foundTr, cNumIdx - 1).text(lnStr);
      })
    }
  }

  function updateVehiclesAndInfo(bill, tr, delta_num, delta_weight) {
    /*
     * 1. New added record (tr) by ADD and MODIFY without confirm: Need to update num & weight hint
     * 2. New added record (tr) by MODIFY with confirm:  Don't update num & weight hint
     * 3. Update record by MODIFY with initial: Don't update num & weight hint
     */
    if (isVessel) {
      var td = tr.find('td:last');
      var wid = td.prop("title");
      var veh = td.find("select").length ? td.find("select").val() : td.text();
      var nameAttr = td.attr("name");
      if (nameAttr === "wagon_no" || nameAttr === "wagon_no_new") {
        vehTotShipNum += delta_num;
        vehTotShipWeight += delta_weight;
        if (vehTotShipNum < 0) {
          vehTotShipNum = 0;
        }

        if (vehTotShipWeight < 0 || Math.abs(vehTotShipWeight) < 0.00001) {
          vehTotShipWeight = 0;
        }
      }

      //waybillHandler.updateVehiclesData(bill, delta_num, delta_weight, veh, wid);
      if ((Math.abs(delta_num) > 0 || Math.abs(delta_weight) > 0.00001)) {
        for (var i = 0; i < bill.vehicles.length; ++i) {
          var veh_obj = bill.vehicles[i];
          if (veh_obj.inner_waybill_no === wid) {
            veh_obj.send_num += delta_num;
            veh_obj.send_weight += delta_weight;
            veh_obj.send_weight = toFixedNumber(veh_obj.send_weight, 3);
            veh_obj.veh_name = veh;
            if (veh_obj.send_num === 0 && veh_obj.send_weight < 0.00001) {
              bill.vehicles.remove(i);
            }

            break;
          }
        }
      }
    }

    totalNumber += delta_num;
    totalWeight += delta_weight;
    if (totalWeight < 0 || Math.abs(totalWeight) < 0.00001) {
      totalWeight = 0;
    }
  }

  function invoiceBodyEventRegister() {
    elementEventRegister($('.redlink'), 'click', function (e) { // remove & delete
      e.stopImmediatePropagation();
      var tr = $(this).closest('tr');
      var bill = waybillHandler.getBill(tr);
      var nw = getNumAndWeight(tr);
      var modifyVessel = action === 'MODIFY' && isVessel;
      waybillHandler.deleteTableRow(bill, modifyVessel, nw, function (billTip, tips) {
        if (nw.num > 0) {
          updateVehiclesAndInfo(bill, tr, (0 - nw.num), (0 - nw.weight));
        }

        if (modifyVessel) {
          updateLeftNumberCol(bill);
        }

        updateUIElem(true, false, bill.order_no, bill.bill_no, tips, billTip);

        tr.remove();
      });
    });

    inputEventRegister($('input[name="ship_number"]'), function (me) {
      var tr = me.closest('tr');
      var oValue = parseInt(me.data("old")) || 0;
      var nValue = oValue;
      var bill = waybillHandler.getBill(tr);
      if (bill.block_num > 0) {
        nValue = numberIntValider(me, 0, bill.left_num + oValue);
        var delta_num = nValue - oValue;
        if (delta_num != 0) {
          var delta_weight = delta_num * bill.weight;
          waybillHandler.updateShipNum(bill, delta_num, function (billTip, tips) {
            me.prop("title", "最大可用块数:{0}, 剩余块数:{1}".format(bill.left, bill.left_num));
            if (action === 'MODIFY' && isVessel) {
              updateLeftNumberCol(bill);
            } else {
              getTableCellChildren(tr, cNumIdx - 1).text(bill.left_num);
            }

            getTableCellChildren(tr, cNumIdx + 1).text(getStrValue(nValue * bill.weight));
            updateVehiclesAndInfo(bill, tr, delta_num, delta_weight);
            updateUIElem(false, false, bill.order_no, bill.bill_no, tips, billTip);

            me.data("old", nValue);
          });
        }
      } else {
        nValue = numberIntValider(me, 0, 2000);
        if (nValue != oValue) {
          if (oValue === 0 && bill.wnum_danding > 0) {
            bill.prev_wnum_danding = bill.wnum_danding;
            bill.wnum_danding = nValue;
          } else {
            bill.wnum_danding += nValue - oValue;
          }

          // bill.wnum_danding = nValue;

          updateVehiclesAndInfo(bill, tr, nValue - oValue, 0);
          updateUIElem(false, false, bill.order_no, bill.bill_no, '', '');

          me.data("old", nValue);
        }
      }
    });

    inputEventRegister($('input[name="ship_weight"]'), function (me) {
      var oValue = parseFloat(me.data("old")) || 0;
      var tr = me.closest('tr');
      var bill = waybillHandler.getBill(tr);
      var nValue = numberFloatValider(me, oValue, 0, toFixedNumber(bill.left_num + oValue, 3));//Number(max.toFixed(3)));
      var delta = nValue - oValue;
      if (Math.abs(delta) > 0.000001) {
        waybillHandler.updateShipNum(bill, delta, function (billTip, tips) {
          me.prop("title", "最大可用重量:{0}, 剩余重量:{1}".format(getStrValue(bill.left), getStrValue(bill.left_num)));

          if (action === 'MODIFY' && isVessel) {
            updateLeftNumberCol(bill);
          } else {
            getTableCellChildren(tr, cNumIdx - 1).text(getStrValue(bill.left_num));
          }

          updateVehiclesAndInfo(bill, tr, 0, delta);
          updateUIElem(false, false, bill.order_no, bill.bill_no, tips, billTip);

          me.data("old", nValue);
        });
      }
    });

    $('select[name="wagon_no_init"]').on('focus', function () {
      $(this).data("old", this.value || "");
    }).on('change', function () {
      $(this).data("new", this.value);
      var me = $(this);
      bootbox.confirm("您确定要修改此提单记录的车号?", function (result) {
        if (result) {
          var tr = me.closest('tr');
        } else {
          me.val(me.data("old"));
          me.data("new", me.data("old"));
        }
      })
    })
  }

  function updateUIElem(needUpdateLabel, needVehInfo, ono, bno, tips, billTip) {
    if (needUpdateLabel) {
      updateHeadText(needVehInfo);
    }

    showTotalWeightNumber();
    saveButtonAvailable();

    sOrderNo.find('option[value="{0}"]'.format(ono)).prop("title", tips);

    var option = sBillNo.find('option[value="{0}"]'.format(bno));
    option.prop("title", billTip.tip);
    option.prop("disabled", billTip.left_num === 0);
  }

  function initVehicleElem() {
    vehTotShipNum = 0;
    vehTotShipWeight = 0;
    vswLabel.text("0.000");
    $('#vehicle-ship-num').text(0);
    el_origin.select2('val', '南钢');
    setHtmlElementDisabled(vehShipCfm, true);
  }

  function getVesselFlag(vehName) {
    var isVessel_tmp = false;
    for (var i = 0; i < dictData.vehInfo.length; ++i) {
      var veh = dictData.vehInfo[i];
      if (veh.name === vehName) {
        var text = '车船号';
        if (veh.veh_type === '车') {
          text = '车号';
        } else if (veh.veh_type === '船') {
          text = '船号';
          isVessel_tmp = true;
        }

        $('#lb-vehicle').text(text);
        break;
      }
    }

    return isVessel_tmp;
  }

  function selectWaybill(wno) {
    waybillHandler.reset(waybillHandler.shipName);
    waybillNo = wno;
    innerWaybillNoOrder = 0;
    selectedWaybill = waybillHandler.getWaybill(wno);
    if (selectedWaybill) {
      waybillHandler.setName(selectedWaybill.ship_name);
      showWaybillData();
    }
  }

  function getCopiedBill(bill, vehInfo) {
    var copiedBill = jQuery.extend({}, bill);
    copiedBill.inner_waybill_no = vehInfo.inner_waybill_no;
    copiedBill.bveh_send_num = vehInfo.send_num;
    copiedBill.bveh_send_weight = (bill.block_num > 0) ? vehInfo.send_num * bill.weight : vehInfo.send_weight;
    copiedBill.bveh_name = vehInfo.veh_name;
    return copiedBill;
  }

  function showWaybillData() {
    isVessel = getVesselFlag(selectedWaybill.vehicle_vessel_name);
    if (action === "REPORT") {
      showWaybillForReport();
    } else {
      invInputUI.fadeIn('slow');

      nlApp.setTitle('正在读取运单数据，请稍等...');
      nlApp.showPleaseWait();

      if (action === "ADD") {
        sVehicleName.select2('val', selectedWaybill.vehicle_vessel_name);
        sShipName.select2('val', selectedWaybill.ship_name);
      } else {
        sVehicleName.val(selectedWaybill.vehicle_vessel_name);
        sShipName.val(selectedWaybill.ship_name);
        $('#invoice_state').val(selectedWaybill.state); // Exist on REMOVE UI
      }

      for (var di = 0; di < dictData.company.length; ++di) {
        if (selectedWaybill.ship_name === dictData.company[di].name) {
          initSelect(sShipCustomer, dictData.company[di].customers, false);
          break;
        }
      }

      sShipCustomer.val(selectedWaybill.ship_customer);
      iShipTo.val(selectedWaybill.ship_to);
      sShipTo.select2('val', selectedWaybill.ship_to);
      sShipFrom.select2('val', selectedWaybill.ship_from);
      iShipDateGrp.data("DateTimePicker").setDate(selectedWaybill.ship_date);

      initInvoiceBody();

      $.get('/get_bill_by_name', {q: selectedWaybill.ship_name}, function (data) {
        var obj = jQuery.parseJSON(data);
        if (obj.ok) {
          obj.bills.forEach(function (bill) {
            waybillHandler.addBill(bill); // 增加所有的提单信息, 并且它选择的发运数为 '0'
          });
        }

        var bills = waybillHandler.getBillsFromInvoice(selectedWaybill);
        if (action === 'MODIFY' && isVessel) {
          var billList = [];
          bills.forEach(function (bill) {
            var res = waybillHandler.addBillAndTableRow_1(bill, bill.wnum);

            sOrderNo.find(':selected').prop("title", res.tips);

            bill.vehicles.forEach(function (bveh) {
              if (bveh.inner_waybill_no && selectedWaybill.waybill_no === bveh.inner_waybill_no.substring(0, 17)) {
                billList.push(getCopiedBill(res.updatedBill, bveh));
              }
            });
          });

          billList = sortByKey(billList, "inner_waybill_no", "ASC");

          billList.forEach(function (bill) {
            var total = (bill.block_num > 0) ? bill.block_num : bill.total_weight;
            totalNumber += bill.bveh_send_num;
            totalWeight += (+bill.bveh_send_weight);

            var html = buildTableTr(bill, total, bill.left_num, bill.bveh_send_num, bill.bveh_send_weight) +
              '<td title="' + bill.inner_waybill_no + '" name="wagon_no_init">' + makeVehSelect("wagon_no_init", bill.bveh_name) + "</td></tr>";
            invoiceBody.append(html);
          })
        } else {
          bills.forEach(function (bill) {
            var sendNumForWaybill = bill.wnum;
            waybillHandler.addBillAndTableRow(bill, sendNumForWaybill, function (b, tips) {
              if (b.openToNew) { // Only TRUE on ADD UI
                if (b.block_num > 0) {
                  totalWeight += (sendNumForWaybill * bill.weight);
                  totalNumber += sendNumForWaybill;
                } else {
                  totalWeight += (+sendNumForWaybill);
                  totalNumber += bill.prev_wnum_danding + bill.wnum_danding;
                }
              } else {
                appendInvoiceBody(b, sendNumForWaybill, true);
              }

              if (sOrderNo.length) {
                sOrderNo.find(':selected').prop("title", tips);
              }
            });
          })
        }

        if (action === "REMOVE") {
          disableAll();
        } else {
          invoiceBodyEventRegister();
          sVehicleName.prop("disabled", true);
          sShipName.prop("disabled", true);
        }

        if (isVessel) {
          innerWaybillNoOrder = getMaxInnerWaybillNo(bills, selectedWaybill.waybill_no);
        }

        showTotalWeightNumber();
        updateHeadText(true);

        if (sOrderNo.length) {
          waybillHandler.insertSelectOptions(sOrderNo, selectedWaybill.ship_name);
        }

        setHtmlElementDisabled(btnSave, true);
        setHtmlElementDisabled(btnSaveShip, true);
        sBillNo.select2('val', '');

        nlApp.hidePleaseWait();
      });
    }
  }

  // UI Handle
  function showTotalWeightNumber() {
    lTotalWeight.text(toFixedStr(totalWeight, 3));
    lTotalNumber.text(totalNumber);
    if (isVessel) {
      $('#vehicle-ship-num').text(vehTotShipNum);
      vswLabel.text(toFixedStr(vehTotShipWeight, 3));
      setHtmlElementDisabled(vehShipCfm, (vehTotShipNum <= 0 || isEmpty(vehicleNo.val())));
    }
  }

  function saveButtonAvailable() {
    setHtmlElementDisabled(btnSave, true);
    setHtmlElementDisabled(btnSaveShip, true);

    if (selectedWaybill && (selectedWaybill.state == '已结算')) {
      return;
    }

    var s1 = sVehicleName.val();
    var s2 = inputForShipTo ? iShipTo.val() : sShipTo.val();
    var s7 = sShipFrom.val();
    var s8 = sShipCustomer.val();
    var b1 = isEmpty(s1);
    var b2 = isEmpty(s2);
    if (b1 || b2 || isEmpty(s7)) {
      return; // 车船号, 目的地必须存在,才能保存和配发
    }

    var s3 = iShipDateGrp.data("DateTimePicker").getDate();
    var b3 = isEmpty(s3);
    var b4 = waybillHandler.hasSelectedBills() || (totalNumber > 0 && totalWeight > 0);

    if (selectedWaybill) {
      var b5 = !waybillHandler.compare(selectedWaybill); // 不相等
      var b6 = true;
      if (selectedWaybill.ship_date && !b3) {
        b6 = !moment(selectedWaybill.ship_date, "YYYY-MM-DD HH:mm").isSame(s3);
      }

      if (selectedWaybill.ship_to != s2 ||
        b6 || selectedWaybill.vehicle_vessel_name != s1 ||
        b5 || selectedWaybill.ship_from != s7 || selectedWaybill.ship_customer != s8) {
        setHtmlElementDisabled(btnSave, false);
        if (!b3 && b4) {
          setHtmlElementDisabled(btnSaveShip, false);
        }
      }
    } else {
      if (!b3 && b4) {
        setHtmlElementDisabled(btnSave, false);
        setHtmlElementDisabled(btnSaveShip, false);
      } else if (b4) {
        setHtmlElementDisabled(btnSave, false);
      }
    }
  }

  function initAllHtmlElements() {
    sShipFrom.select2('val', '南钢');
    sShipTo.select2('val', '');
    iShipTo.val('');
    if (iShipDateGrp.length) {
      iShipDateGrp.data("DateTimePicker").setDate("");
    }

    if (action === 'ADD' || action === 'MODIFY') {
      sVehicleName.select2('val', '');
      sShipName.select2('val', '');
    } else {
      sVehicleName.val("");
      sShipName.val("");
    }

    if (action === 'REMOVE') {
      disableAll();
    } else {
      sOrderNo.empty();
      sBillNo.empty();
      vehicleNo.select2('val', '');

      setHtmlElementDisabled(btnSave, true);
      setHtmlElementDisabled(btnSaveShip, true);
    }

    initInvoiceBody();

    if (sWaybillNo.length > 0) {
      sWaybillNo.val('');
      sWaybillNo.select2("val", "");
      unselected(myWaybillQuery);
    }
  }

  function initInvoiceBody() {
    totalWeight = 0;
    totalNumber = 0;
    invoiceBody.empty();
    showTotalWeightNumber();
  }

  function disableAll() {
    invInputUI.find('input').prop('disabled', true);
    invInputUI.find('select').prop('disabled', true);
    $('#inv-table-input').find('input').prop('disabled', true);
    if (iShipDateGrp.length) {
      iShipDateGrp.data("DateTimePicker").disable();
    }
  }

  // import function
  $('#invoice_import').on('click', function () {
    bootbox.alert('功能还在实现中...,请稍等!');
  });

  // REPORT FUNCTION
  function showEditDialog(name, elem, okHandler) {
    var dname = $('#dict_name');
    var dok = $('#data-btn-ok');
    setElementValue($('#phone'), '');
    setElementValue($('#contact'), '');
    setElementValue($('#address'), '');
    setElementValue(dname, getElementValue(elem));
    dname.prop('disabled', true);
    setHtmlElementDisabled(dok, false);

    dok.on('click', function () {
      okHandler();
      $('#data-dialog').modal('hide');
    });

    $('#lbl-name').text(name);
    $('#dialog-title').text('编辑' + name);
    $('#data-dialog').modal({backdrop: 'static', keyboard: false}).modal('show');
  }

  function showWaybillForReport() {
    showHtmlElement($('#waybill-tools'), true);
    $('#report-content').fadeIn('slow');
    setElementValue($('#report-bill-name'), selectedWaybill.ship_name);
    setElementValue($('#report-ship-customer'), selectedWaybill.ship_customer ? selectedWaybill.ship_customer : selectedWaybill.ship_name);
    var rbphoneElem = $('#report-bill-phone');
    setElementValue(rbphoneElem, '');
    for (var i = 0; i < dictData.company.length; ++i) {
      var company = dictData.company[i];
      if (company.name === selectedWaybill.ship_name) {
        setElementValue(rbphoneElem, company.phone);
        break;
      }
    }

    setElementValue($('#report-ship-to'), selectedWaybill.ship_to);
    var rsphoneElem = $('#report-shipto-phone');
    var rscontactElem = $('#report-shipto-contact');
    setElementValue(rsphoneElem, '');
    setElementValue(rscontactElem, '');
    for (var k = 0; k < dictData.destination.length; ++k) {
      var dest = dictData.destination[k];
      if (dest.name === selectedWaybill.ship_to) {
        setElementValue(rsphoneElem, dest.phone);
        setElementValue(rscontactElem, dest.contact_name);
        break;
      }
    }

    setElementValue($('#report-waybill-no'), selectedWaybill.waybill_no);
    setElementValue($('#report-vehicle-name'), selectedWaybill.vehicle_vessel_name);
    if (selectedWaybill.ship_date) {
      setElementValue($('#report-ship-date'), date2Str(selectedWaybill.ship_date, false));
    } else {
      setElementValue($('#report-ship-date'), '');
    }
    setElementValue($('#report-ship-from'), selectedWaybill.ship_from);
    dictData.vehInfo.forEach(function (vehicle) {
      if (vehicle.name === selectedWaybill.vehicle_vessel_name) {
        setElementValue($('#report-ship-phone'), vehicle.phone);
      }
    });

    var allBills = waybillHandler.getBillsFromInvoice(selectedWaybill);
    $('#report-table-body').html(getTableHtml(allBills));
    showHtmlElement($('#report-th-vessel'), isVessel);
    reportTable.trigger("update");

    var tn = 0, tw = 0;
    allBills.forEach(function (b) {
      if (b.block_num > 0) {
        tw += b.weight * b.wnum;
        tn += b.wnum;
      } else {
        tw += b.wnum;
        tn += (b.prev_wnum_danding + b.wnum_danding);
      }
    });

    setElementValue($('#report-total-weight'), toFixedStr(tw, 3));
    setElementValue($('#report-total-number'), tn);
  }

  function getTableHtml(allBills) {
    var html = [], str = "<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td><td>{11}</td></tr>";

    if (isVessel) {
      var allVehBills = [];
      allBills.forEach(function (b) {
        b.invoices.forEach(function (inv) {
          if (inv.inv_no === waybillNo) {
            inv.vehicles.forEach(function (veh) {
              allVehBills.push(getCopiedBill(b, veh));
            })
          }
        });
      });
      allVehBills = sortByKey(allVehBills, "inner_waybill_no", "ASC");
      allVehBills.forEach(function (b) {
        html.push(str.format(b.bill_no, getOrder(b.order_no, b.order_item_no), b.brand_no ? b.brand_no : "",
          getStrValue(b.thickness), getStrValue(b.width), getStrValue(b.len), (b.block_num > 0) ? getStrValue(b.weight) : "",
          b.bveh_send_num, getStrValue(b.bveh_send_weight), b.ship_warehouse ? b.ship_warehouse : "", b.contract_no ? b.contract_no : "", b.bveh_name));
      })
    }
    else {
      str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>';
      allBills.forEach(function (b) {
        if (b.block_num > 0) {
          html.push(str.format(b.bill_no, getOrder(b.order_no, b.order_item_no),
            b.brand_no ? b.brand_no : "", getStrValue(b.thickness), getStrValue(b.width), getStrValue(b.len),
            getStrValue(b.weight), getStrValue(b.wnum), getStrValue(b.weight * b.wnum),
            b.ship_warehouse ? b.ship_warehouse : "", b.contract_no ? b.contract_no : ""));
        } else {
          html.push(str.format(b.bill_no, getOrder(b.order_no, b.order_item_no),
            b.brand_no ? b.brand_no : "", getStrValue(b.thickness), getStrValue(b.width), getStrValue(b.len),
            '', getStrValue(b.prev_wnum_danding + b.wnum_danding), getStrValue(b.wnum),
            b.ship_warehouse ? b.ship_warehouse : "", b.contract_no ? b.contract_no : ""));
        }
      });
    }

    return html.join('');
  }

});
