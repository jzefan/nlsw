/**
 * Created by jzefan on 2016/7/27.
 */
$(function () {
    "use strict";

    var totalWeight = 0;
    var totalNumber = 0;
    var vehTotShipNum = 0;
    var vehTotShipWeight = 0;
    var vswLabel = $('#vehicle-ship-weight');

    var sBillNo     = $('#bill_no');
    var invInputUI  = $('#invoice-input-content');
    var invoiceBody = $('#invoice_tbody');

    var sVehicleName  = $('#vehicle_name');
    var sShipName     = $('#ship_name');      // 开单名称
    var sShipCustomer = $('#ship_customer'); // 发货单位
    var iShipTo       = $('#ship_to_input');
    var sShipTo       = $('#ship-to-select');
    var sShipFrom     = $('#start-warehouse');
    var iShipDateGrp  = $('#ship-date-grp');
    var lTotalWeight  = $('#total_weight_td');
    var lTotalNumber  = $('#total_number_td');
    var sOrderNo      = $('#order_no_by_name');
    var cNumIdx       = 10; // const for num input
    var waybillNo     = '';
    var innerWaybillNoOrder = 0;

    var waybillHandler = new WayBillHandlerD('');  // initial data

    var username    = local_user.userid;
    var dictData    = local_dict_data;
    var isVessel    = false; // 使用船来配发
    var vehicleNo   = $('#vehicle-no');
    var allVehicles = [];

    var sWaybillNo           = $('#waybill_no_query');
    var btnUpdateShipWaybill = $('#waybill_udpate_shipping');
    var btnUpdateWaybill     = $('#waybill_update');
    var selectedWaybill;

    select2Setup(sWaybillNo, {inputLength: 4, placeholder: '查找运单号', url: '/get_waybill'}, function (data) {
        waybillHandler.setQueryData(data);
    });

    iShipDateGrp.datetimepicker(getDateTimePickerOptions()).on('dp.change change', saveButtonAvailable);

    var myWaybillQuery = $('#my_waybill_query');
    var checkWaybillMe = $('#checkWaybillForMe');
    checkWaybillMe.iCheck('uncheck');

    if (!isEmpty(dictData)) {
        dictData.warehouse = sort_pinyin(dictData.warehouse);
        dictData.destination = sort_pinyin(dictData.destination);
        initSelect(sShipFrom, dictData.warehouse, false);
        initSelect(sShipTo, dictData.destination, false);
        initSelect($('#origin'), dictData.warehouse, false);

        dictData.vehInfo.forEach(function(vehicle) {
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
    elementEventRegister(btnUpdateWaybill, 'click', function() {
        if (selectedWaybill && (selectedWaybill.state === '已结算')) {
            bootbox.alert('此运单已结算,不能更新!');
        } else {
            buildDataAndSave('新建', '/distribute_invoice', '更新配发货/登记');
        }
    });

    elementEventRegister(btnUpdateShipWaybill, 'click', function() {
        if (selectedWaybill && (selectedWaybill.state === '已结算')) {
            bootbox.alert('此运单已结算,不能更新配发!');
        } else {
            bootbox.confirm('确定配发当前选择的订单?', function (result) {
                if (result) {
                    buildDataAndSave('已配发', '/distribute_invoice', '更新并确定配发');
                }
            });
        }
    });

    var inputForShipTo = false;
    elementEventRegister(iShipTo, 'keyup paste', saveButtonAvailable);
    elementEventRegister(sShipTo, 'change', saveButtonAvailable);
    elementEventRegister($('#lbl-ship-to'), 'click', function () {
        iShipTo.toggle();
        sShipTo.toggle();
        inputForShipTo = !inputForShipTo;
        iShipTo.val('');
        unselected(sShipTo);
        saveButtonAvailable();
    });

    elementEventRegister(sOrderNo, 'change', function () {
        var res = waybillHandler.findCreate(this.value, false);
        if (res.found) {
            var opts = res.data.getOptions(sShipName.val());
            sBillNo.empty();
            opts.forEach(function (option) {
                sBillNo.append(option);
            });
            sBillNo.select2('val', '');
        }
    });

    elementEventRegister(sBillNo, 'change', function () {
        var inner_id = isVessel ? (waybillNo + leftPad(innerWaybillNoOrder, 3)) : "";
        waybillHandler.addAndInsertTable(sOrderNo, sBillNo, inner_id, function(bills) {
            bills.forEach(function(bill) {
                appendInvoiceBody(bill, 0, false);
            });

            var numOfTrs = invoiceBody.find('tr').length;
            invoiceBody.find('tr').removeClass('selected-highlighted');
            for (var i = 0; i < numOfTrs; ++i) {
                var tr = getRowChildren(invoiceBody, i);
                var bno = getTableCellChildren(tr, 1).text();
                var ono = getTableCellChildren(tr, 2).text();
                for (var k = 0, l = bills.length; k < l; ++k) {
                    var o = getOrder(bills[k].order_no, bills[k].order_item_no);
                    if (bno === bills[k].bill_no && ono === o) {
                        tr.addClass('selected-highlighted');
                        break;
                    }
                }
            }

            invoiceBodyEventRegister();

            updateHeadText(true);
            showTotalWeightNumber();
            saveButtonAvailable();
        });
    });

    elementEventRegister(sShipFrom, 'change', saveButtonAvailable); // 车辆始发处理
    elementEventRegister(sShipCustomer, 'change', saveButtonAvailable);

    elementEventRegister(vehicleNo, 'change', function() {
        $(this).data("old", $(this).data("new") || "");
        var oldV = $(this).data("old");
        var value = this.value;
        $(this).data("new", value);
        if (vehTotShipNum > 0) {
            if (oldV) {
                var s = '车辆号:"' + oldV + '"还没确定配发完成, 如果更换车辆号,之前的这辆车的配发数据无效并被丢失, 确定吗?';
                bootbox.confirm(s, function (result) {
                    if (result) {
                        $('td[name="wagon_no_new"]').text(value);
                        setHtmlElementDisabled($('#vehicle-ship-confirm'), (value) ? false : true);
                    } else {
                        //vehicleNo.val(oldV);
                        vehicleNo.select2('val', oldV);
                        $(this).data("new", oldV);
                    }
                })
            } else {
                $('td[name="wagon_no_new"]').text(value);
                setHtmlElementDisabled($('#vehicle-ship-confirm'), (value) ? false : true);
            }
        } else {
            $('td[name="wagon_no_new"]').text(value);
            var numOfRow = invoiceBody.find("tr").length;// $('#invoice_tbody tr').length;
            if (numOfRow > 0) {
                for (var i = 0; i < numOfRow; ++i) {
                    var tr = getRowChildren(invoiceBody, i);
                    var last_td_attr_name = tr.find("td:last").attr("name");
                    if (last_td_attr_name === "wagon_no" || last_td_attr_name === "wagon_no_new") {
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
    elementEventRegister($('#vehicle-ship-confirm'), 'click', function() {
        if (!checkNumWeightInput()) {
            bootbox.alert("请完成发运块数和发运重量的输入!");
        } else {
            var vno = vehicleNo.val();
            var wid = waybillNo + leftPad(innerWaybillNoOrder, 3);
            waybillHandler.handleVehicleComplete(wid, vno, $('#origin').val());

            $('td[name="wagon_no_new"]').attr("name", "wagon_no_confirm");
            invoiceBody.find('tr').removeClass('selected-highlighted');

            sBillNo.select2('val', '');
            vehicleNo.select2('val', '');
            vehicleNo.data("old", "");
            vehicleNo.data("new", "");

            waybillHandler.insertSelectOptions(sOrderNo, waybillHandler.currShipName);
            initVehicleElem();
            ++innerWaybillNoOrder; // 内部运单递增

            bootbox.alert('车"' + vno + '"配发完成!');
        }
    });

    function checkNumWeightInput() {
        var numOfRow = invoiceBody.find("tr").length; // $('#invoice_tbody tr').length;
        for (var i = 0; i < numOfRow; ++i) {
            var tr = getRowChildren(invoiceBody, i);
            var td = getTableCellChildren(tr, cNumIdx + 1);
            var num = (+getTableCellChildren(tr, cNumIdx).find("input").val());
            var weight = 0;
            if (td.find("input").length) {
                weight = (+td.find("input").val());
                if ((num > 0 && weight === 0) || (num === 0 && weight > 0) ) {
                    return false;
                }
            }
        }

        return true;
    }

    /*
     * save data and reset UI
     */
    function buildDataAndSave(status, route, msg) {
        if (isVessel) {
            if (vehTotShipNum > 0) {
                bootbox.alert("车号:" + vehicleNo.val() + "未确定配发完毕, 保存前请确定.");
                return;
            } else {
                var numOfRow = invoiceBody.find("tr").length;
                for (var i = 0; i < numOfRow; ++i) {
                    var tr = getRowChildren(invoiceBody, i);
                    var veh_no = tr.find('td:last-child').text();
                    if (isEmpty(veh_no)) {
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
            waybillHandler.insertSelectOptions(sOrderNo, waybillHandler.currShipName);

            sBillNo.select2('val', '');

            if (status === '已配发') {
                selectedWaybill = undefined;
                initAllHtmlElements();

                if (msg.indexOf('更新') >= 0) {
                    sWaybillNo.select2("val", "");
                    myWaybillQuery.val('');
                }

                waybillHandler.reset('');
                isVessel = false;
                waybillNo = "";
                $('#waybill_no').text(waybillNo);
                invInputUI.toggle();
            } else {
                setHtmlElementDisabled(btnUpdateWaybill, true);
            }
        });
    }

    function getNumAndWeight(tr) {
        var data = { num : 0, weight : 0 };
        data.num = (+getTableCellChildren(tr, cNumIdx).find('input').val());
        var td = getTableCellChildren(tr, cNumIdx + 1);
        if (td.find('input').length) {
            data.weight = (+td.find('input').val());
        } else {
            data.weight = (+td.text());
        }

        return data;
    }

    function updateHeadText(needVehicleInfo) {
        if (needVehicleInfo) {
            showHtmlElement($('#inv-table-input th:last-child, #inv-table-input td:last-child'), isVessel);
            showHtmlElement($('#vehicle-info'), isVessel);
        }

        var res = waybillHandler.hasMixedBill();
        var t1 = '实际块数';
        var t2 = '剩余块数';
        if (res === 2) {
            t1 = '实际重量'; t2 = '剩余重量';
        } else if (res === 3) {
            t1 = '实际块数/重量'; t2 = '剩余块数/重量';
        }

        $('#real-head-text').text(t1);
        $('#left-head-text').text(t2);
    }

    function buildTableTr(bill, total, left, send_num, send_weight) {
        var dw = (bill.block_num > 0) ? getStrValue(bill.weight) : "";
        var str = '<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td align="center">{7}</td><td align="center">{8}</td>'
            .format(bill.bill_no, getOrder(bill.order_no, bill.order_item_no), bill.ship_warehouse? bill.ship_warehouse : "",
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

    function getVehSelect(name, veh_name) {
        var wagonNoSelect = '<select disabled style="width: 100%" name="' + name + '">';
        if (isEmpty(veh_name)) {
            wagonNoSelect += '<option selected disabled hidden value=""></option>';
        }

        allVehicles.forEach(function(vname) {
            if (vname === veh_name) {
                wagonNoSelect += '<option selected>' + vname + '</option>';
            } else {
                wagonNoSelect += '<option>' + vname + '</option>';
            }
        });

        wagonNoSelect += "</select>";

        return wagonNoSelect;
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

        if (!isVessel) {
            if (bill.block_num > 0) {
                send_num = num;
                send_weight = num * bill.weight;
            } else {
                send_num = bill.prev_wnum_danding + bill.wnum_danding;
                send_weight = num;
            }

            totalNumber += send_num;
            totalWeight += (+send_weight);

            html = buildTableTr(bill, total, left, send_num, send_weight);
            if (isVessel) {
                html += getVehTableData("wagon_no") + "</tr>";
                vehTotShipNum += send_num;
                vehTotShipWeight += (+send_weight);
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
                        html = buildTableTr(bill, total, left, send_num, send_weight) + '<td title="' + bveh.inner_waybill_no + '">' + getVehSelect("wagon_no_init", bveh.veh_name) + "</td></tr>";
                        invoiceBody.append(html);
                    }
                });
            } else {
                html = buildTableTr(bill, total, bill.left_num, 0, 0);
                invoiceBody.prepend(html + getVehTableData("wagon_no_new") + "</tr>");
            }
        }
    }

    // 更新剩余块数列单元
    function updateLeftNumberCol(bill) {
        var result = findSameTr(bill, false, false);
        if (result.length) {
            var lnStr = getStrValue(bill.left_num);
            result.forEach(function(foundTr) {
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
            var wid = td.attr("title");
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
                        veh_obj.send_num    += delta_num;
                        veh_obj.send_weight += delta_weight;
                        veh_obj.send_weight = toFixedNumber(veh_obj.send_weight, 3);
                        veh_obj.veh_name    = veh;
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
        elementEventRegister($('.redlink'), 'click', function(e) { // remove & delete
            e.stopImmediatePropagation();
            var tr = $(this).closest('tr');
            var bill = waybillHandler.getBill(tr);
            var nw = getNumAndWeight(tr);
            waybillHandler.deleteTableRow(bill, isVessel, nw, function(billTip, tips) {
                if (nw.num > 0) {
                    updateVehiclesAndInfo(bill, tr, (0 - nw.num), (0 - nw.weight));
                }

                tr.remove();
                if (isVessel) {
                    updateLeftNumberCol(bill);
                }

                updateHeadText(false);
                updateUI(bill, tips, billTip);
            });
        });

        inputEventRegister($('input[name="ship_number"]'), function(me) {
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
                        if (isVessel) {
                            updateLeftNumberCol(bill);
                        } else {
                            getTableCellChildren(tr, cNumIdx - 1).text(bill.left_num);
                        }

                        getTableCellChildren(tr, cNumIdx + 1).text(getStrValue(nValue * bill.weight));
                        updateVehiclesAndInfo(bill, tr, delta_num, delta_weight);
                        updateUI(bill, tips, billTip);
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

                    updateVehiclesAndInfo(bill, tr, nValue - oValue, 0);
                    updateUI(bill, "", "");
                    me.data("old", nValue);
                }
            }
        });

        inputEventRegister($('input[name="ship_weight"]'), function(me) {
            var oValue = parseFloat(me.data("old")) || 0;
            var tr = me.closest('tr');
            var bill = waybillHandler.getBill(tr);
            var nValue = numberFloatValider(me, oValue, 0, toFixedNumber(bill.left_num + oValue, 3));//Number(max.toFixed(3)));
            var delta = nValue - oValue;
            if (Math.abs(delta) > 0.000001) {
                waybillHandler.updateShipNum(bill, delta, function (billTip, tips) {
                    me.prop("title", "最大可用重量:{0}, 剩余重量:{1}".format(getStrValue(bill.left), getStrValue(bill.left_num)));
                    if (isVessel) {
                        updateLeftNumberCol(bill);
                    } else {
                        getTableCellChildren(tr, cNumIdx - 1).text(getStrValue(bill.left_num));
                    }
                    updateVehiclesAndInfo(bill, tr, 0, delta);
                    updateUI(bill, tips, billTip);
                    me.data("old", nValue);
                });
            }
        });

        $('select[name="wagon_no_init"]').on('focus', function () {
            $(this).data("old", this.value || "");
        }).on('change', function() {
            $(this).data("new", this.value);
            var me = $(this);
            bootbox.confirm("您确定要修改此提单记录的车号?", function(result) {
                if (result) {
                    var tr = me.closest('tr');
                } else {
                    me.val(me.data("old"));
                    me.data("new", me.data("old"));
                }
            })
        })
    }

    function updateUI(bill, tips, btip) {
        if (tips) {
            updateOptionTip(bill.order_no, bill.bill_no, tips, btip);
        }

        showTotalWeightNumber();
        saveButtonAvailable();
    }

    function initVehicleElem() {
        vehTotShipNum = 0;
        vehTotShipWeight = 0;
        vswLabel.text("0.000");
        $('#vehicle-ship-num').text(0);
        setHtmlElementDisabled($('#vehicle-ship-confirm'), true);
        $('#origin').val("南钢");
    }

    function getVesselFlag(vehName) {
        var isVessel_tmp = false;
        for (var i = 0; i < dictData.vehInfo.length; ++i) {
            var veh = dictData.vehInfo[i];
            if (veh.name === vehName) {
                if (veh.veh_type === '车') {
                    $('#lb-vehicle').text('车号');
                } else if (veh.veh_type === '船') {
                    $('#lb-vehicle').text('船号');
                    isVessel_tmp = true;
                } else {
                    $('#lb-vehicle').text('车船号');
                }
                break;
            }
        }

        return isVessel_tmp;
    }

    /////////////////////////////////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////
    elementEventRegister(checkWaybillMe, 'ifChecked', function() {
        showHtmlElement($('#div-my-select'), true);
        showHtmlElement($('#div-select2'), false);
        var obj = { $or: [ {shipper: username }, { username: username}] };
        $.get('/get_invoices_by_condition', { q: JSON.stringify(obj), isNeedAnalysis: false }, function(data) {
            var result = JSON.parse(data);
            if (result.ok) {
                waybillHandler.setQueryData(result);
                myWaybillQuery.empty();
                $.each(result.invoices, function(index, inv ) {
                    var no = inv.waybill_no;
                    myWaybillQuery.append("<option value='" + no + "'>" + no + "</option>");
                });
                unselected(myWaybillQuery);
            }
        });
    });

    elementEventRegister(checkWaybillMe, 'ifUnchecked', function() {
        showHtmlElement($('#div-my-select'), false);
        showHtmlElement($('#div-select2'), true);
    });

    elementEventRegister(myWaybillQuery, 'change', function() {
        selectWaybill(this.value);
    });

    elementEventRegister(sWaybillNo, 'change', function(e) {
        if (e.added) {
            selectWaybill(e.added.text);
        }
    });

    function selectWaybill(wno) {
        waybillHandler.reset(waybillHandler.currShipName);
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
        invInputUI.fadeIn('slow');

        sVehicleName.val(selectedWaybill.vehicle_vessel_name);
        sShipName.val(selectedWaybill.ship_name);

        for (var di = 0; di < dictData.company.length; ++di) {
            if (selectedWaybill.ship_name === dictData.company[di].name) {
                initSelect(sShipCustomer, dictData.company[di].customers, false);
                break;
            }
        }

        sShipCustomer.val(selectedWaybill.ship_customer);
        iShipTo.val(selectedWaybill.ship_to);
        sShipTo.val(selectedWaybill.ship_to);
        sShipFrom.val(selectedWaybill.ship_from);
        iShipDateGrp.data("DateTimePicker").setDate(selectedWaybill.ship_date);

        initInvoiceBody();
        $.get('/get_bill_by_name', { q: selectedWaybill.ship_name }, function (data) {
            var obj = jQuery.parseJSON(data);
            obj.bills.forEach(function (bill) {
                waybillHandler.addBill(bill); // 增加所有的提单信息, 并且它的选择的发运数为 '0'
            });

            var bills = waybillHandler.getBillsFromInvoice(selectedWaybill);
            if (isVessel) {
                var billList = [];
                bills.forEach(function (bill) {
                    var res = waybillHandler.addBillAndTableRow_1(bill, bill.wnum);

                    sOrderNo.find(':selected').prop("title", res.tips);

                    bill.vehicles.forEach(function (bveh) {
                        var wid = bveh.inner_waybill_no.substring(0, 17);
                        if (wid === selectedWaybill.waybill_no) {
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
                        '<td title="' + bill.inner_waybill_no + '" name="wagon_no_init">' + getVehSelect("wagon_no_init", bill.bveh_name) + "</td></tr>";
                    invoiceBody.append(html);
                });
            } else {
                bills.forEach(function (bill) {
                    var sendNumForWaybill = bill.wnum;
                    waybillHandler.addBillAndTableRow(bill, sendNumForWaybill, function (b, tips) {
                        appendInvoiceBody(b, sendNumForWaybill, true);
                        sOrderNo.find(':selected').prop("title", tips);
                    });
                });
            }

            invoiceBodyEventRegister();
            sVehicleName.prop("disabled", true);
            sShipName.prop("disabled", true);

            if (isVessel) {
                var maxId = 0;
                bills.forEach(function (bill) {
                    bill.invoices.forEach(function (inv) {
                        if (inv.inv_no === selectedWaybill.waybill_no) {
                            inv.vehicles.forEach(function (veh) {
                                var id = parseInt(veh.inner_waybill_no.substring(17));
                                maxId = Math.max(maxId, id);
                            })
                        }
                    });
                });

                innerWaybillNoOrder = maxId + 1;
            }

            showTotalWeightNumber();
            updateHeadText(true);

            waybillHandler.insertSelectOptions(sOrderNo, selectedWaybill.ship_name);
            setHtmlElementDisabled(btnUpdateWaybill, true);
            setHtmlElementDisabled(btnUpdateShipWaybill, true);
            sBillNo.select2('val', '');
        });
    }

    elementEventRegister($('#waybill_delete'), 'click', function () {
        if (selectedWaybill && waybillNo) {
            if (selectedWaybill.state === '已结算') {
                bootbox.alert('此运单已结算,不能删除!');
            } else {
                bootbox.confirm('您确定要删除吗?', function (result) {
                    if (result) {
                        ajaxRequestHandle('/delete_invoice', 'POST', selectedWaybill, '运单删除:' + waybillNo, function () {
                            myWaybillQuery.find('[value="' + waybillNo + '"]').remove();
                            initAllHtmlElements();
                            waybillHandler.reset('');
                            selectedWaybill = null;
                        });
                    }
                })
            }
        }
    });

    //////////////////////////////////////////////////////////////////////
    // Search function handle
    //////////////////////////////////////////////////////////////////////
    elementEventRegister($('#invoice_search'), 'click', function() {
        var searchHandler = new SearchHandlerD('invoice');
        searchHandler.initial('/get_invoices_by_condition');
        searchHandler.okEventHandler( function(result, selectedIdx) {
            waybillHandler = new WayBillHandlerD('');
            waybillHandler.setQueryData(result);
            selectedWaybill = waybillHandler.getWaybillInvoice(selectedIdx);
            waybillNo = selectedWaybill.waybill_no;
            innerWaybillNoOrder = 0;
            waybillHandler.setName(selectedWaybill.ship_name);

            $('#search_dialog').modal('hide');

            sWaybillNo.select2("val", waybillNo);
            myWaybillQuery.val(waybillNo);

            showWaybillData();
        });

        $('#search_dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    });

    function updateOptionTip(no, bno, tips, bill_tips) {
        var search = 'option[value="{0}"]'.format(no);
        var option = sOrderNo.find(search);
        option.prop("title", tips);

        search = 'option[value="{0}"]'.format(bno);
        option = sBillNo.find(search);
        option.prop("title", bill_tips.tip);
        option.prop("disabled", bill_tips.left_num === 0);
    }

    var isBlink = false;
    function showTotalWeightNumber() {
        lTotalWeight.text(toFixedStr(totalWeight, 3));
        lTotalNumber.text(totalNumber);
        if (isVessel) {
            $('#vehicle-ship-num').text(vehTotShipNum);
            vswLabel.text(toFixedStr(vehTotShipWeight, 3));
            if (vehTotShipWeight > 500) { // 大于五百吨, 闪烁提醒
                if (!isBlink) {
                    isBlink = true;
                    vswLabel.each(function () {
                        var elem = $(this);
                        setInterval(function () {
                            elem.css('visibility',
                                (elem.css('visibility') === 'hidden') ? 'visible' : 'hidden');
                        }, 500);
                    });
                }
            } else {
                isBlink = false;
            }

            setHtmlElementDisabled($('#vehicle-ship-confirm'), vehTotShipNum <= 0 || isEmpty(vehicleNo.val()));
        }
    }

    function saveButtonAvailable() {
        setHtmlElementDisabled(btnUpdateWaybill, true);
        setHtmlElementDisabled(btnUpdateShipWaybill, true);

        if (selectedWaybill && selectedWaybill.state !== '已结算') {
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

            var b5 = !waybillHandler.compare(selectedWaybill); // 不相等
            var b6 = true;
            if (selectedWaybill.ship_date && !b3) {
                var m = moment(selectedWaybill.ship_date, "YYYY-MM-DD HH:mm");
                b6 = !m.isSame(s3);
            }

            if (selectedWaybill.ship_to != s2 ||
                b6 || selectedWaybill.vehicle_vessel_name != s1 ||
                b5 || selectedWaybill.ship_from != s7 || selectedWaybill.ship_customer != s8) {
                setHtmlElementDisabled(btnUpdateWaybill, false);
                if (!b3 && b4) {
                    setHtmlElementDisabled(btnUpdateShipWaybill, false);
                }
            }
        }
    }

    function initAllHtmlElements() {
        sShipFrom.val('南钢');
        iShipTo.val('');
        unselected(sShipTo);
        iShipDateGrp.data("DateTimePicker").setDate("");

        sVehicleName.val("");
        sShipName.val("");

        sOrderNo.empty();
        sBillNo.empty();
        vehicleNo.select2('val', '');

        setHtmlElementDisabled(btnUpdateWaybill, true);
        setHtmlElementDisabled(btnUpdateShipWaybill, true);

        sWaybillNo.val('');
        sWaybillNo.select2("val", "");
        unselected(myWaybillQuery);

        initInvoiceBody();
    }

    function initInvoiceBody() {
        totalWeight = 0;
        totalNumber = 0;
        invoiceBody.empty();
        showTotalWeightNumber();
    }
});

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
function inputEventRegister(elements, func) {
    if (elements.length > 0) {
        elements.on('focus', function () {
            $(this).one('mouseup', function () {
                $(this).select();
                return false;
            }).select();

            $(this).data("old", this.value || "");
        });

        elements.on('keyup paste', function (e) {
            e.stopImmediatePropagation();
            func($(this));
        });

        elements.ForceNumericOnly();
    }
}

////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
function setTip(bill, select_num) {
    if (bill.block_num > 0) {
        bill.tip = '订单项次号:{0}, 提单号:{1}, 实际块数:{2}, 可用块数:{3}, 当前运单已用块数:{4}'.format(bill.order_item_no, bill.bill_no, bill.block_num, bill.left_num, select_num);
    } else {
        bill.tip = '订单项次号:{0}, 提单号:{1}, 实际重量:{2}, 剩余重量:{3}, 当前运单已用重量:{4}'.format(bill.order_item_no, bill.bill_no, getStrValue(bill.total_weight), getStrValue(bill.left_num), getStrValue(select_num));
    }
}

// class & object define
var ShipBillD = function(order_no) {
    this.no = order_no;
    this.left_num = 0;
    this.allBills = [];
};

ShipBillD.prototype.getOptionWithTip = function(shipname) {
    var tip = 'data-toggle="tooltip" title="{0}" data-html="true"'.format(this.getTip(shipname));
    if (this.left_num > 0) {
        return '<option value="' + this.no + '" ' + tip + '>' + this.no + '</option>';
    } else {
        return '<option disabled value="' + this.no + '" ' + tip + '>' + this.no + '</option>';
    }
};

ShipBillD.prototype.getTip = function(name) {
    var tips = [];
    this.allBills.forEach(function(b) {
        if (b.billing_name == name) {
            tips.push(b.tip);
        }
    });

    return tips.join('\n');
};

ShipBillD.prototype.getOptions = function(name) {
    var opts = [];
    var result = {};
    this.allBills.forEach(function(b) {
        if (b.billing_name == name) {
            if (result[b.bill_no]) {
                result[b.bill_no].push(b);
            } else {
                result[b.bill_no] = [ b ];
            }
        }
    });

    var keys = Object.keys(result);
    keys.sort();
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var tip = [];
        var left = 0;
        result[key].forEach(function(b) {
            tip.push(b.tip);
            left += b.left_num;
        });

        var tips = 'data-toggle="tooltip" title="{0}" data-html="true"'.format(tip.join('\n'));
        if (left > 0) {
            opts.push('<option value="' + key + '" ' + tips + '>' + key + '</option>');
        }
    }

    return opts;
};

ShipBillD.prototype.getBillTips = function(name, billNo) {
    var left = 0;
    var tips = [];
    this.allBills.forEach(function(b) {
        if (b.billing_name == name && b.bill_no == billNo) {
            left += b.left_num;
            tips.push(b.tip);
        }
    });

    return { left_num: left, tip: tips.join('\n') };
};

ShipBillD.prototype.find = function(bill) {
    var result = { found: false};
    for (var i = 0; i < this.allBills.length; ++i) {
        var b = this.allBills[i];
        if (b.order_no == bill.order_no && b.order_item_no == bill.order_item_no && b.bill_no == bill.bill_no) {
            result.found = true;
            result.bill = b;
            result.index = i;
            break;
        }
    }

    return result;
};

ShipBillD.prototype.add = function(bill) {
    bill.selected = false;
    bill.select_number = 0;
    bill.left = 0;

    if (bill.left_num >= 0) {
        this.left_num += bill.left_num;
        bill.left = bill.left_num;  // left保存left_num, left_num是随着用户设置发运数动态的改变
    }

    setTip(bill, 0);
    bill.prev_select_num = 0;
    bill.prev_wnum_danding = 0; // 单定的发运块数
    bill.wnum = 0;  // 运单读入时的发运数 (来自数据库)
    bill.wnum_danding = 0;
    bill.vehicles = [];
    this.allBills.push(bill);
};

ShipBillD.prototype.save = function() {
    this.allBills.forEach(function(b) {
        if (b.selected) {
            b.selected = false;
            b.select_number = 0;
            b.left = b.left_num;
        }
    });
};

ShipBillD.prototype.selectedWithWaybillNum = function(idx, num) {
    var bill = this.allBills[idx];
    if (num > 0) {
        bill.selected = true;
        bill.select_number = num;
        if (bill.left_num >= 0) {
            this.left_num -= bill.left_num;
            bill.left_num = bill.left;
            bill.left = bill.left_num + num;
            this.left_num += bill.left_num;
        }

        setTip(bill, num);
    }
};

//////////////////////////////////////////////////////////////////////
// Class WayBillHanderD definition
var WayBillHandlerD = function(name) {
    this.billsInfo = [];
    if (name) {
        this.currShipName = name;
    }
    this.queryWaybillData = {};
};

WayBillHandlerD.prototype.setName = function(name) {
    this.currShipName = name;
};

WayBillHandlerD.prototype.reset = function(name) {
    this.billsInfo = [];
    this.currShipName = name;
};

WayBillHandlerD.prototype.save = function() {
    this.billsInfo.forEach(function(item) {
        item.save();
    });
};

WayBillHandlerD.prototype.saveInvoice = function(data) {
    if (this.queryWaybillData && this.queryWaybillData.invoices) {
        var invs = this.queryWaybillData.invoices;
        for (var i = 0; i < invs.length; ++i) {
            var inv = invs[i];
            if (inv.waybill_no === data.waybill_no) {
                inv.vehicle_vessel_name = data.vehicle_vessel_name;
                inv.ship_name = data.ship_name;
                inv.ship_customer = data.ship_customer;
                inv.ship_from = data.ship_from;
                inv.ship_to = data.ship_to;
                inv.ship_date = data.ship_date;
                inv.bills = data.bills;
                inv.total_weight = data.total_weight;
                inv.username = data.username;
                inv.shipper = data.shipper;
                inv.state = data.state;
                break;
            }
        }
    }

    this.billsInfo.forEach(function(item) {
        item.allBills.forEach(function(bill) {
            if (bill.selected) {
                bill.prev_select_num = (bill.prev_select_num > 0) ? (bill.prev_select_num + bill.select_number) : bill.select_number;
                bill.select_number = 0;
                bill.left = bill.left_num;

                if (bill.block_num === 0) { // 单定重量块数
                    bill.prev_wnum_danding = (bill.prev_wnum_danding > 0) ? (bill.prev_wnum_danding + bill.wnum_danding) : bill.wnum_danding;
                    bill.wnum_danding = 0; // 当前界面下单定的发运块数
                }
            }
        })
    });
};

WayBillHandlerD.prototype.addBill = function(bill) {
    var result = this.findCreate(bill.order_no, true);
    if (!result.found || (result.found && !result.data.find(bill).found)) {
        result.data.add(bill);
    }
};

WayBillHandlerD.prototype.addBillAndTableRow = function(bill, num, insert) {
    var result = this.findCreate(bill.order_no, true);
    var res = result.data.find(bill);
    if (result.found && res.found) {
        result.data.selectedWithWaybillNum(res.index, num);
        res.bill.vehicles = bill.vehicles.slice(0);
        res.bill.wnum_danding = bill.wnum_danding;
        res.bill.prev_wnum_danding = bill.prev_wnum_danding;
        insert(res.bill, result.data.getTip(this.currShipName));
    } else {
        bill.selected = true;
        bill.select_number = num;

        if (bill.left_num >= 0) {
            bill.left = bill.left_num + (+num);
            this.left_num += bill.left;
        }

        setTip(bill, num);
        result.data.allBills.push(bill);

        insert(bill, result.data.getTip(this.currShipName));
    }
};

WayBillHandlerD.prototype.addBillAndTableRow_1 = function(bill, num) {
    var result = this.findCreate(bill.order_no, true);
    var res = result.data.find(bill);
    if (result.found && res.found) {
        if (num > 0) {
            res.bill.selected = true;
            res.bill.prev_select_num = num;
            res.bill.select_number = 0;

            setTip(res.bill, num);
        }

        res.bill.vehicles = bill.vehicles.slice(0);
        res.bill.wnum_danding = bill.wnum_danding;
        res.bill.prev_wnum_danding = bill.prev_wnum_danding;
        return {updatedBill: res.bill, tips: result.data.getTip(this.currShipName) };
    } else {
        bill.selected = true;
        bill.select_number = num;

        if (bill.left_num >= 0) {
            bill.left = bill.left_num + (+num);
            this.left_num += bill.left;
        }

        setTip(bill, num);
        result.data.allBills.push(bill);

        return {updatedBill: bill, tips: result.data.getTip(this.currShipName) };
    }
};

WayBillHandlerD.prototype.addAndInsertTable = function(sOrder, sBill, innerWNo, insert) {
    var orderNo = sOrder.val();
    var result = this.findCreate(orderNo, false);
    if (!result.found) {
        return false;
    }

    var billNo = sBill.val();
    var needUpdateTip = false;
    var selectedBills = [];
    for (var i = 0; i < result.data.allBills.length; ++i) {
        var b = result.data.allBills[i];
        if (b.left_num > 0 && b.bill_no === billNo) {
            b.selected = true;
            selectedBills.push(b);
//      insert(b, b.select_number, false);
            needUpdateTip = true;

            b.inner_waybill_no = innerWNo;
        }
    }

    if (needUpdateTip) {
        insert(selectedBills);
        sOrder.find(':selected').prop("title", result.data.getTip(this.currShipName));
        var billTip = result.data.getBillTips(this.currShipName, billNo);
        var search = 'option[value="{0}"]'.format(billNo);
        var option = sBill.find(search);
        option.prop("title", billTip.tip);
        option.prop("disabled", billTip.left_num == 0);
    }

    return needUpdateTip;
};

WayBillHandlerD.prototype.deleteTableRow = function(b, isVesselForUpdate, nwData, updateUI) {
    var result = this.findCreate(b.order_no, false);
    if (result.found) {
        if (typeof b.prev_select_num === 'undefined') {
            b.prev_select_num = 0;
        }
        if (isVesselForUpdate) {
            if (b.block_num > 0) {
                b.select_number -= nwData.num;
                b.left_num += nwData.num;
                result.data.left_num += nwData.num;
            } else {
                b.select_number -= nwData.weight;
                b.wnum_danding -= nwData.num;
                b.left_num += nwData.weight;
                result.data.left_num += nwData.weight;
            }

            setTip(b, ((b.select_number + b.prev_select_num > 0) ? (b.select_number + b.prev_select_num > 0) : 0) )
        } else {
            b.select_number = 0;
            if (b.left >= 0) {
                b.left_num = b.left;
                result.data.left_num += b.left;
            }

            setTip(b, ((b.prev_select_num > 0) ? b.prev_select_num : 0));
        }

        var billTip = result.data.getBillTips(this.currShipName, b.bill_no);
        updateUI(billTip, result.data.getTip(this.currShipName));
    }
};

WayBillHandlerD.prototype.updateShipNum = function(b, delta, updateUI) {
    var result = this.findCreate(b.order_no, false);
    if (result.found) {
        if (b.left_num >= 0) {
            b.left_num -= delta;
            b.select_number += delta;
            result.data.left_num -= delta;
            if (b.block_num === 0) {
                if (Math.abs(b.left_num) < 0.00001) {
                    b.left_num = 0;
                }
                if (Math.abs(b.select_number) < 0.00001) {
                    b.select_number = 0;
                }
            }
            if (b.prev_select_num > 0) {
                setTip(b, b.select_number + b.prev_select_num);
            } else {
                setTip(b, b.select_number);
            }
        }

        var billTip = result.data.getBillTips(this.currShipName, b.bill_no);
        updateUI(billTip, result.data.getTip(this.currShipName));
    }
};

WayBillHandlerD.prototype.findCreate = function(no, created) {
    var result = { found: false };
    for (var i = 0; i < this.billsInfo.length; ++i) {
        if (this.billsInfo[i].no === no) {
            result.found = true;
            result.data = this.billsInfo[i];
            break;
        }
    }

    if (!result.found && created) {
        var new_obj = new ShipBillD(no);
        this.billsInfo.push(new_obj);
        result.data = new_obj;
    }

    return result;
};

WayBillHandlerD.prototype.getBill = function(tr) {
    var bno = getTableCellChildren(tr, 1).text();
    var order = getTableCellChildren(tr, 2).text();
    var res = order.split('-');

    for (var i = 0; i < this.billsInfo.length; ++i) {
        var obj = this.billsInfo[i];
        if (obj.no === res[0]) {
            for (var k = 0; k < obj.allBills.length; ++k) {
                var b = obj.allBills[k];
                var order_1 = getOrder(b.order_no, b.order_item_no);
                if (order === order_1 && bno === b.bill_no) {
                    return b;
                }
            }
        }
    }

    return undefined;
};

WayBillHandlerD.prototype.handleVehicleComplete = function(innerWNo, vehName, vehShipFrom) {
    this.billsInfo.forEach(function(item) {
        item.allBills.forEach(function (bill) {
            if (bill.selected && bill.inner_waybill_no === innerWNo && bill.select_number > 0) {
                var obj = {
                    inner_waybill_no: innerWNo,
                    veh_name: vehName,
                    veh_ship_from : vehShipFrom,
                    send_num: 0,
                    send_weight: 0
                };

                if (bill.block_num > 0) {
                    obj.send_num = bill.select_number;
                    obj.send_weight = toFixedNumber(bill.select_number * bill.weight, 3);
                } else {
                    obj.send_num = bill.wnum_danding;
                    obj.send_weight = toFixedNumber(bill.select_number, 3);
                }

                bill.vehicles.push(obj);

                bill.prev_select_num += bill.select_number;
                if (typeof bill.prev_wnum_danding === 'undefined') {
                    bill.prev_wnum_danding = (bill.wnum_danding > 0) ? bill.wnum_danding : 0;
                } else {
                    bill.prev_wnum_danding += (bill.wnum_danding > 0) ? bill.wnum_danding : 0;
                }
                bill.select_number = 0;
                bill.wnum_danding = 0;
                bill.left = bill.left_num;
                bill.inner_waybill_no = ""; // clear it for new inner waybill created
            }
        });
    });
};

WayBillHandlerD.prototype.hasSelectedBills = function() {
    var self = this;
    for (var i = 0; i < self.billsInfo.length; ++i) {
        var item = self.billsInfo[i];
        for (var k = 0; k < item.allBills.length; ++k) {
            var bill = item.allBills[k];
            if (bill.selected && bill.select_number > 0) {
                if (bill.block_num > 0) {
                    return true;
                } else if (bill.wnum_danding > 0) {
                    return true;
                }
            }
        }
    }

    return false;
};

WayBillHandlerD.prototype.getSelectedBills = function() {
    var selectedBills = [];
    this.billsInfo.forEach(function(item) {
        item.allBills.forEach(function(bill) {
            if (bill.selected) {// && (bill.select_number > 0 || bill.prev_select_num > 0)) {
                var num = (bill.prev_select_num > 0) ? (bill.prev_select_num + bill.select_number) : bill.select_number;
                var allVehSendNum = 0;
                if (bill.vehicles.length) {
                    bill.vehicles.forEach(function(bveh) {
                        allVehSendNum += bveh.send_num;
                    })
                }

                if (bill.block_num > 0) {
                    if (allVehSendNum > 0) {
                        num = allVehSendNum;
                    }
                    if (num > 0) {
                        selectedBills.push({
                            bill_id: bill._id,
                            num: num,
                            weight: 0,
                            vehicles: bill.vehicles.slice(0)
                        });
                    }
                } else {
                    var danding = (bill.prev_wnum_danding > 0) ? (bill.prev_wnum_danding + bill.wnum_danding) : bill.wnum_danding;
                    if (allVehSendNum > 0) {
                        danding = allVehSendNum;
                    }
                    if (num > 0 && danding > 0) {
                        selectedBills.push({
                            bill_id: bill._id,
                            num: danding,
                            weight: num,
                            vehicles: bill.vehicles.slice(0)
                        });
                    }
                }
            }
        })
    });

    return selectedBills;
};

// 有单定和定尺结合的
WayBillHandlerD.prototype.hasMixedBill = function() {
    var result = 0;
    for (var i = 0; i < this.billsInfo.length; ++i) {
        var item = this.billsInfo[i];
        for (var k = 0; k < item.allBills.length; ++k) {
            var bill = item.allBills[k];
            if (bill.selected) {
                if (bill.block_num > 0) {
                    result = (result === 2) ? 3 : 1;
                } else if (result === 1) {
                    result = 3; // 混合
                } else {
                    result = 2; // 单定 - 只有重量
                }
            }

            if (result === 3) {
                return 3;
            }
        }
    }

    return result;
};

WayBillHandlerD.prototype.compare = function(invoice) {
    var count = 0;
    for (var idx0 = 0; idx0 < this.billsInfo.length; ++idx0) {
        var item = this.billsInfo[idx0];
        for (var idx1 = 0; idx1 < item.allBills.length; ++idx1) {
            var bill = item.allBills[idx1];
            if (bill.selected) {
                ++count;
                var found = false;
                for (var i = 0; i < invoice.bills.length; ++i) {
                    var b = invoice.bills[i];
                    if (bill._id == b.bill_id) {
                        if (bill.block_num > 0) {
                            found = (bill.select_number == b.num);
                        } else {
                            found = (bill.select_number == b.weight && bill.wnum_danding == b.num);
                        }
                        break;
                    }
                }

                if (!found) {
                    return false; // 找不到相同的id, 则返回false表示不相同
                }
            }
        }
    }

    // 所有的id都能找到, 但是如果数量不一样,则同样不相同
    return (count == invoice.bills.length);
};

WayBillHandlerD.prototype.insertSelectOptions = function(element, name) {
    element.empty();
    var allDisabled = [];
    var orderList = [];
    var items = [];
    this.billsInfo.forEach(function(item) {
        for (var i = 0; i < item.allBills.length; ++i) {
            if (name === item.allBills[i].billing_name) {
                if (item.left_num > 0) {
                    items.push(item);
                    orderList.push(item.no);
                } else {
                    allDisabled.push(item.getOptionWithTip(name));
                }
                break;
            }
        }
    });

    var orders = orderList.sort();
    orders.forEach(function(order) {
        for (var k = 0; k < items.length; ++k) {
            if (items[k].no === order) {
                element.append(items[k].getOptionWithTip(name));
                break;
            }
        }
    });

    allDisabled.forEach(function(opt) {
        element.append(opt);
    });

    unselected(element);
};

WayBillHandlerD.prototype.setQueryData = function(data) {
    this.queryWaybillData = data;
};

WayBillHandlerD.prototype.getWaybill = function(wno) {
    var invs = this.queryWaybillData.invoices;
    for (var i = 0; i < invs.length; ++i) {
        if (wno == invs[i].waybill_no) {
            return invs[i];
        }
    }
};

WayBillHandlerD.prototype.getWaybillInvoice = function(idx) {
    if (idx >= 0 && idx < this.queryWaybillData.invoices.length) {
        return this.queryWaybillData.invoices[idx];
    }
};

WayBillHandlerD.prototype.getBillsFromInvoice = function(waybill) {
    var bills = [];
    var allBills = this.queryWaybillData.bills;
    waybill.bills.forEach(function (wbill) {
        for (var i = 0; i < allBills.length; ++i) {
            var b = allBills[i];
            if (wbill.bill_id == b._id) {
                if (b.block_num > 0) {
                    b.wnum = wbill.num;
                } else {
                    b.wnum = wbill.weight;
                    b.prev_wnum_danding = 0;//wbill.num;
                    b.wnum_danding = wbill.num;
                }

                b.vehicles = wbill.vehicles.slice(0);
                bills.push(b);
                break;
            }
        }
    });

    return bills;
};
