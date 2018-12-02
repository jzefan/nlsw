/**
 * Created by ezefjia on 2015/5/10.
 */

$(function () {
  "use strict";

  var dbData = {};

  var vehvesNameSelect = $('#vehves-name');
  var rVehicle     = $('#radio-vehicle');
  var rVessel      = $('#radio-vessel');
  var vehicleTable = $('#vehicle-table');
  var vesselTable  = $('#vessel-table');

  var dataBtnOk    = $('#data-btn-ok');
  var searchBtnOk  = $('#stat-btn-ok');
  var startDateGrp = $('#start-date-grp');
  var endDateGrp   = $('#end-date-grp');
  var yearGrp      = $('#year-grp');
  var monthGrp     = $('#month-grp');

  var sVVName = $('#vvname');
  var monthChoiceGrp = $('#month-choice-grp');
  var monthChoice = $('#month-choice');

  var iIC  = $('#i-ic');
  var iHC  = $('#i-hc');
  var iPCC = $('#i-pcc');
  var iAux = $('#i-aux');
  var iFittings = $('#i-fittings');
  var iRepair   = $('#i-repair');
  var iAS       = $('#i-as');
  var iSalary   = $('#i-salary');
  var iOil      = $('#i-oil');
  var iToll     = $('#i-toll');
  var iFine     = $('#i-fine');
  var iOther    = $('#i-other');
  var iTotal = $('#i-total');
  var allInputFields = $('#data-input').find('input');

  var btnUpdate = $('#data-modify');
  var btnRemove = $('#data-delete');
  var btnExport = $('#data-export');

  var isVehicle = true;
  var startDate = null, endDate = null;
  var selectedMonth = '';
  var selectedVehVes = [];
  var tHandler = TableHandler.createNew(true);

  if (local_data) {
    dbData = local_data;
    initSelect(vehvesNameSelect, dbData.vehicles, false);
    initSelect(sVVName, dbData.vehList, false);
  }

  rVehicle.iCheck('check');
  rVessel.iCheck('uncheck');

  vehvesNameSelect.select2();
  sVVName.select2();

  dateComponentInitial();

  allInputFields.each(function() {
    this.value = '';
    $(this).ForceNumericOnly();
  });

  setHtmlElementDisabled(iTotal, true);

  function switchVehicleVessel(isVeh) {
    isVehicle = isVeh;

    showHtmlElement(vehicleTable, isVeh);
    showHtmlElement(vesselTable, !isVeh);
    showHtmlElement($('#vehicle-row'), isVeh);
    showHtmlElement($('#vessel-row'), !isVeh);
    showHtmlElement($('#dd-col-vvname'), isVeh);
    showHtmlElement($('#s2id_vehves-name'), isVeh);
    showHtmlElement($('#lb-vehves-name'), isVeh);

    tHandler.setVehileFlag(isVeh);
    tHandler.show(enableButton);

    if (!isVeh) {
      getAndShowVFCData({ fVVName: ['chuan'], fDate1: null, fDate2: null, fVVType: 'chuan'});
    }
  }

  rVehicle.on('ifChecked', function() { switchVehicleVessel(true); });
  rVessel.on('ifChecked', function() { switchVehicleVessel(false); });

  // 月份选择处理
  $('#month-search').on('click', function() {
    startDate = null;
    endDate = null;
    $('.input-group.date').find('input').each(function() {
      this.value = '';
    });

    setHtmlElementDisabled(searchBtnOk, true);
    $('#radio_month').iCheck('check');
    $('#stat-condition-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  });

  function dateChanged(e) {
    var me = $(e.target);
    var id = me.attr('id');
    if (id === "month-grp") {
      startDate = e.date.startOf('month');
      endDate = moment(startDate).add(1, 'months');
      setHtmlElementDisabled(searchBtnOk, false);
    }
    else if (id === "start-date-grp") {
      endDateGrp.data("DateTimePicker").setMinDate(e.date);
      startDate = e.date.startOf('month');
      if (startDate && endDate && startDate.isBefore(endDate)) {
        setHtmlElementDisabled(searchBtnOk, false);
      }
    }
    else if (id === "end-date-grp") {
      startDateGrp.data("DateTimePicker").setMaxDate(e.date);
      endDate = e.date.startOf('month').add(1, 'months');
      if (startDate && endDate && startDate.isBefore(endDate)) {
        setHtmlElementDisabled(searchBtnOk, false);
      }
    }
    else if (id === 'month-choice-grp') {
      selectedMonth = e.date.startOf('month').format("YYYY-MM");
      var okEnabled = isVehicle ? (!isEmpty(selectedMonth) && iTotal.val() > 0 && sVVName.val()) : (!isEmpty(selectedMonth) && iTotal.val() > 0);
      setHtmlElementDisabled(dataBtnOk, !okEnabled);
      getOneData('month');
    }
    else {
      startDate = e.date.startOf('year');
      endDate = moment(startDate).add(1, 'years');
      setHtmlElementDisabled(searchBtnOk, false);
    }
  }

  function dateComponentInitial() {
    var opts = getDateTimePickerOptions();

    opts.minViewMode = 'months';
    opts.format = 'YYYY-MM';
    startDateGrp.datetimepicker(opts).on('dp.change', dateChanged);
    endDateGrp.datetimepicker(opts).on('dp.change', dateChanged);
    monthGrp.datetimepicker(opts).on('dp.change', dateChanged);

    //monthChoiceGrp.datetimepicker(opts).on('dp.change', dateChanged);

    opts.minViewMode = 'years';
    opts.format = 'YYYY';
    yearGrp.datetimepicker(opts).on('dp.change', dateChanged);
  }

  function switchDateChoose(isYear, isNonYear, isMonth) {
    showHtmlElement($('#year-choose'), isYear);
    showHtmlElement($('#non-year-choose'), isNonYear);
    showHtmlElement($('#month-choose'), isMonth);
  }

  $('#radio_month').on('ifChecked', function() { switchDateChoose(false, true, false); });
  $('#radio_single_year').on('ifChecked', function() { switchDateChoose(true, false, false); });
  $('#radio_single_month').on('ifChecked', function() { switchDateChoose(false, false, true); });

  function getAndShowVFCData(qObj) {
    $('body').css({'cursor':'wait'});
    $.get('/get_vessel_fixed_cost_data', qObj, function (data) {
      var result = jQuery.parseJSON(data);
      if (result.ok) {
        tHandler.setVVData(result.vvcList);
      } else {
        tHandler.setVVData([]);
      }

      tHandler.show(enableButton);
      $('body').css({'cursor':'default'});
    });
  }

  searchBtnOk.on('click', function() {
    $('#stat-condition-dialog').modal('hide');

    getAndShowVFCData({ fVVName: selectedVehVes,
      fDate1: startDate.toISOString(), fDate2: endDate.toISOString(),
      fVVType: (isVehicle? 'che' : 'chuan') });
  });

  elementEventRegister(vehvesNameSelect, 'change', function(e) {
    selectedVehVes = e.val;
    var obj = { fVVName: selectedVehVes, fDate1: '', fDate2: '', fVVType: (isVehicle ? 'che' : 'chuan') };
    if (startDate && endDate) {
      obj.fDate1 = startDate.toISOString();
      obj.fDate2 = endDate.toISOString();
    }

    getAndShowVFCData(obj);
  });

  ////////////////////////////////////////////////////////////////////////////////////
  function getOneData(field) {
    var name = 'chuan';
    if (isVehicle) {
      name = sVVName.val();
    }

    var qObj = {
      fName: name ? name : '',
      fMonth: selectedMonth ? selectedMonth : ''
    };

    $.get('/get_one_vfc_data', qObj, function (data) {
      var result = jQuery.parseJSON(data);
      if (result.ok) {
        bootbox.alert('不能增加, 记录已存在！车船名：' + name + ', 月份:' + selectedMonth);
        if (field === 'name') {
          sVVName.select2().select2('val', '');
        } else if (field === 'month') {
          selectedMonth = '';
          monthChoice.val('');
        }
      }
    });
  }

  var data_action = '';
  elementEventRegister($('#data-add'), 'click', function() {
    data_action = 'ADD';
    if (isVehicle) {
      sVVName.select2().select2('val', '');
      sVVName.select2('enable');
    }

    selectedMonth = '';
    monthChoice.val('');
    setHtmlElementDisabled(monthChoice, false);
    setHtmlElementDisabled(monthChoiceGrp, false);
    allInputFields.each(function() { this.value = ''; });

    var opts = getDateTimePickerOptions();
    opts.minViewMode = 'months';
    opts.format = 'YYYY-MM';
    monthChoiceGrp.datetimepicker(opts).on('dp.change', dateChanged);
    $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  });

  elementEventRegister(sVVName, 'change', function(e) {
    var value = e.val;
    var okEnabled = isVehicle ? (!isEmpty(selectedMonth) && iTotal.val() > 0 && value) : (!isEmpty(selectedMonth) && iTotal.val());
    setHtmlElementDisabled(dataBtnOk, !okEnabled);

    getOneData('name');
  });

  elementEventRegister(allInputFields, "keyup paste", function() {
    var num = 0;
    allInputFields.each(function() {
      var id = $(this).attr('id');
      var val = this.value;
      if (id !== 'i-total' && isNumeric(val)) {
        num += parseFloat(val);
      }
    });

    iTotal.val(num);

    var okEnabled = isVehicle ? (!isEmpty(selectedMonth) && num > 0 && sVVName.val()) : (!isEmpty(selectedMonth) && num > 0);
    setHtmlElementDisabled(dataBtnOk, !okEnabled);
  });

  dataBtnOk.on('click', function() {
    var data = {
      name: (isVehicle ? sVVName.val() : 'chuan'),
      ic: iIC.val() ? parseFloat(iIC.val()) : 0,
      hc: iHC.val() ? parseFloat(iHC.val()) : 0,
      pcc: iPCC.val() ? parseFloat(iPCC.val()) : 0,
      aux: iAux.val() ? parseFloat(iAux.val()) : 0,
      fittings: iFittings.val() ? parseFloat(iFittings.val()) : 0,
      repair: iRepair.val() ? parseFloat(iRepair.val()) : 0,
      annual_survey: iAS.val() ? parseFloat(iAS.val()) : 0,
      salary: iSalary.val() ? parseFloat(iSalary.val()) : 0,
      oil: iOil.val() ? parseFloat(iOil.val()) : 0,
      toll: iToll.val() ? parseFloat(iToll.val()) : 0,
      fine: iFine.val() ? parseFloat(iFine.val()) : 0,
      other: iOther.val() ? parseFloat(iOther.val()) : 0,
      total: iTotal.val(),
      month: selectedMonth,
      vv_type: isVehicle? 'che' : 'chuan'
    };

    ajaxRequestHandle('/one_vessel_fixed_cost', 'POST', data, '数据保存', function() {
      $('#data-dialog').modal('hide');
      var result = false;
      if (data_action === 'ADD') {
        result = tHandler.addData(data);
        if (result && isVehicle) {
          if (selectedVehVes.indexOf(data.name) < 0) {
            selectedVehVes.push(data.name);
          }

          if (dbData.vehicles.indexOf(data.name) < 0) {
            vehvesNameSelect.append("<option value='" + data.name + "'>" + data.name + "</option>");
          }

          vehvesNameSelect.select2("val", selectedVehVes);
        }
      } else if (data_action === 'UPDATE') {
        result = tHandler.updateData(data);
      }

      if (result) {
        tHandler.show(enableButton);
      }
    });
  });

  elementEventRegister(btnUpdate, 'click', function() {
    data_action = 'UPDATE';
    var data = tHandler.getSelectedData();
    if (data) {
      selectedMonth = data.month;
      monthChoice.val(data.month);
      setHtmlElementDisabled(monthChoice, true);

      if (isVehicle) {
        sVVName.select2().select2('val', data.name);
        sVVName.select2('disable');

        iFittings.val(data.fittings);
        iRepair.val(data.repair);
        iAS.val(data.annual_survey);
        iSalary.val(data.salary);
        iOil.val(data.oil);
        iToll.val(data.toll);
        iFine.val(data.fine);
      } else {
        iIC.val(data.ic);
        iHC.val(data.hc);
        iPCC.val(data.pcc);
        iAux.val(data.aux);
      }

      iOther.val(data.other);
      iTotal.val(data.total);

      var opts = getDateTimePickerOptions();
      opts.minViewMode = 'months';
      opts.format = 'YYYY-MM';
      monthChoiceGrp.datetimepicker(opts).on('dp.change', dateChanged);
      $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    } else {
      bootbox.alert('请先选择一行');
    }
  });

  elementEventRegister(btnRemove, 'click', function() {
    var data = tHandler.getSelectedData();
    if (data) {
      ajaxRequestHandle('/delete_vfc_data', 'POST', data, '数据删除', function() {
        if (tHandler.removeData(data.name, data.month)) {
          tHandler.show(enableButton);

          if (isVehicle && !tHandler.isExistSameName(data.name)) { // 当前显示的数据并不再有name, remove it
            var opt = "option[value='" + data.name + "']";
            vehvesNameSelect.find(opt).remove();

            var idx = selectedVehVes.indexOf(data.name);
            if (idx >= 0) {
              selectedVehVes.remove(idx);
              if (selectedVehVes.length) {
                vehvesNameSelect.select2("val", selectedVehVes);
              } else {
                vehvesNameSelect.select2("val", '');
              }
            }
          }
        }
      });
    } else {
      bootbox.alert('请先选择一行');
    }
  });

  function enableButton(idx) {
    var dis = idx < 0;
    setHtmlElementDisabled(btnUpdate, dis);
    setHtmlElementDisabled(btnRemove, dis);
  }

  elementEventRegister(btnExport, 'click', function() { tHandler.exportExcel(); });
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var TableHandler = {
  createNew: function(isVehicle) {
    var selectedIdx = -1;
    var tableHandler = {
      vehTable: $('#vehicle-table'),
      vesTable : $('#vessel-table'),
      vehicleBody: $('#vehicle-tbody'),
      vesselBody : $('#vessel-tbody'),
      isVehicle  : isVehicle,
      vvData: []
    };

    tableHandler.show = function(enableButtonFunc) {
      selectedIdx = -1;
      var self = this;
      var vvBody = self.isVehicle ? self.vehicleBody : self.vesselBody;
      vvBody.empty();

      if (self.vvData.length) {
        var str = '';
        if (self.isVehicle) {
          var v0 = 0, v1 = 0, v2 = 0, v3 = 0, v4 = 0, v5 = 0, v6 = 0, v7 = 0, v8 = 0, v9 = 0, v10 = 0;
          str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td><td>{7}</td><td>{8}</td><td>{9}</td><td>{10}</td></tr>';
          self.vvData.forEach(function(vv) {
            if (vv.vv_type === 'che') {
              vvBody.append(str.format(vv.month, vv.name, getStrValue(vv.fittings), getStrValue(vv.repair),
                getStrValue(vv.annual_survey), getStrValue(vv.salary), getStrValue(vv.oil),
                getStrValue(vv.toll), getStrValue(vv.fine), getStrValue(vv.other), getStrValue(vv.total)));
              v2 += vv.fittings;
              v3 += vv.repair;
              v4 += vv.annual_survey;
              v5 += vv.salary;
              v6 += vv.oil;
              v7 += vv.toll;
              v8 += vv.fine;
              v9 += vv.other;
              v10 += vv.total;
            }
          });
          vvBody.append(str.format('合计', '', getStrValue(v2), getStrValue(v3), getStrValue(v4),
            getStrValue(v5), getStrValue(v6), getStrValue(v7), getStrValue(v8), getStrValue(v9), getStrValue(v10)));

        } else {
          str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td><td>{6}</td></tr>';
          var lv0 = 0, lv1 = 0, lv2 = 0, lv3 = 0, lv4 = 0, lv5 = 0, lv6 = 0;
          self.vvData.forEach(function(vv) {
            if (vv.vv_type === 'chuan') {
              vvBody.append(str.format(vv.month, getStrValue(vv.ic), getStrValue(vv.hc), getStrValue(vv.pcc),
                getStrValue(vv.aux), getStrValue(vv.other), getStrValue(vv.total)));
              lv1 += vv.ic;
              lv2 += vv.hc;
              lv3 += vv.pcc;
              lv4 += vv.aux;
              lv5 += vv.other;
              lv6 += vv.total;
            }
          });

          vvBody.append(str.format('合计', getStrValue(lv1), getStrValue(lv2), getStrValue(lv3),
            getStrValue(lv4), getStrValue(lv5), getStrValue(lv6)));
        }

        tr_click(vvBody.find('tr'), function(e, index) {
          var numOfTrs = vvBody.find('tr').length;
          if (index !== numOfTrs - 1) {
            selectedIdx = index;
            enableButtonFunc(index);
          } else {
            selectedIdx = -1;
            enableButtonFunc(selectedIdx);
          }
        });
      } else {
        selectedIdx = -1;
        enableButtonFunc(selectedIdx);
      }
    };

    tableHandler.setVVData = function(inData) {
      this.vvData = inData;
    };

    tableHandler.addData = function(data) {
      var self = this;
      var found = false;
      for (var i = 0; i < self.vvData.length; ++i) {
        if (self.vvData[i].name === data.name && self.vvData[i].month === data.month) {
          found = true;
          break;
        }
      }

      if (found) {
        bootbox.alert('已存在相同的记录: 车船名 = ' + data.name + ' 月份 = ' + data.month);
      } else {
        self.vvData.unshift(data);
      }

      return !found;
    };

    tableHandler.removeData = function(name, month) {
      var self = this;
      var found = false;
      for (var i = 0; i < self.vvData.length; ++i) {
        if (self.vvData[i].name === name && self.vvData[i].month === month) {
          self.vvData.remove(i);
          found = true;
          break;
        }
      }

      return found;
    };

    tableHandler.updateData = function(data) {
      var self = this;
      var found = false;
      for (var i = 0; i < self.vvData.length; ++i) {
        if (self.vvData[i].name === data.name && self.vvData[i].month === data.month) {
          self.vvData[i].ic = data.ic;
          self.vvData[i].hc = data.hc;
          self.vvData[i].pcc = data.pcc;
          self.vvData[i].aux = data.aux;
          self.vvData[i].fittings = data.fittings;
          self.vvData[i].repair = data.repair;
          self.vvData[i].annual_survey = data.annual_survey;
          self.vvData[i].salary = data.salary;
          self.vvData[i].oil = data.oil;
          self.vvData[i].toll = data.toll;
          self.vvData[i].fine = data.fine;
          self.vvData[i].other = data.other;
          self.vvData[i].total = data.total;
          found = true;
          break;
        }
      }

      return found;
    };

    tableHandler.getSelectedData = function() {
      return this.vvData[selectedIdx];
    };

    tableHandler.isExistSameName = function(name) {
      var exist = false;
      if (this.vvData.length) {
        var type = this.isVehicle ? 'che' : 'chuan';
        for (var i = 0; i < this.vvData.length; ++i) {
          var vv = this.vvData[i];
          if (vv.vv_type === type && vv.name === name) {
            exist = true;
            break;
          }
        }
      }

      return exist;
    };

    tableHandler.setVehileFlag = function(inFlag) {
      this.isVehicle = inFlag;
    };

    tableHandler.exportExcel = function() {
      var exist = false;
      if (this.vvData.length) {
        var type = this.isVehicle ? 'che' : 'chuan';
        for (var i = 0; i < this.vvData.length; ++i) {
          if (this.vvData[i].vv_type === type) {
            exist = true;
            break;
          }
        }
      }

      if (exist) {
        var t = (this.isVehicle ? this.vehTable : this.vesTable);
        tableToExcel(t.html(), "data");
      }
    };

    return tableHandler;
  }
};