/**
 * Created by ezefjia on 2015/7/6.
 */

$(function () {
  "use strict";

  var btnAdd = $('#data-add');
  var btnUpdate = $('#data-modify');
  var btnRemove = $('#data-delete');
  var btnExport = $('#data-export');

  var dataBtnOk = $('#data-btn-ok');
  var dataBody = $('#data-tbody');
  var iDrayage = $('#i-drayage');
  var iForklift = $('#i-forklift');
  var monthChoiceGrp = $('#month-choice-grp');
  var monthChoice = $('#month-choice');

  var ldata = local_data;
  var selectedIdx = -1;
  var action = 'unknown';
  var selectedMonth = '';

  setHtmlElementDisabled(btnUpdate, true);
  setHtmlElementDisabled(btnRemove, true);
  iDrayage.ForceNumericOnly();
  iForklift.ForceNumericOnly();

  var opts = getDateTimePickerOptions();
  opts.minViewMode = 'months';
  opts.format = 'YYYY-MM';
  monthChoiceGrp.datetimepicker(opts).on('dp.change', function(e) {
    selectedMonth = e.date.startOf('month').format("YYYY-MM");
    setHtmlElementDisabled(dataBtnOk, false);
    getOneData('month');
  });

  resetTable();

  btnAdd.on('click', function() {
    initElements(false);

    selectedMonth = '';
    monthChoice.val('');
    setHtmlElementDisabled(monthChoice, false);
    setHtmlElementDisabled(monthChoiceGrp, false);

    action = 'add';
    $('#i-title').val('短驳叉车应收款输入');
    $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  });

  btnUpdate.on('click', function() {
    showIt(false, '短驳叉车应收款更新', 'update');
  });

  btnRemove.on('click', function() {
    showIt(true, '短驳叉车应收款删除', 'delete');
  });

  btnExport.on('click', function() {
    var html = $('#data-table').html();
    var filename = "download";
    filename += date2Str(new Date()) + ".xls";
    tableToExcel(html, 'data', filename);
  });

  dataBtnOk.on('click', function() {
    if (selectedMonth) {
      var data = {
        month: selectedMonth,
        drayage: iDrayage.val() ? parseFloat(iDrayage.val()) : 0,
        forklift: iForklift.val() ? parseFloat(iForklift.val()) : 0
      };

      if (action === 'delete') {
        ajaxRequestHandle('/delete_df_data', 'POST', data, '数据删除', function() {
          $('#data-dialog').modal('hide');
          for (var i = 0; i < ldata.length; ++i) {
            if (ldata[i].month === selectedMonth) {
              ldata.remove(i);
              break;
            }
          }

          resetTable();
        });
      } else {
        ajaxRequestHandle('/one_df_receivables', 'POST', data, '数据保存', function () {
          $('#data-dialog').modal('hide');
          if (action === 'add') {
            ldata.push(data);
          } else if (action === 'update') {
            for (var i = 0; i < ldata.length; ++i) {
              if (ldata[i].month === selectedMonth) {
                ldata[i].drayage = data.drayage;
                ldata[i].forklift = data.forklift;
              }
            }
          }

          resetTable();
        });
      }
    } else {
      bootbox.alert('请选择月份');
    }
  });


  function tableBodyEventHandler() {
    tr_click(dataBody.find('tr'), function (e, index) {
      selectedIdx = index;
      if (index >= 0) {
        setHtmlElementDisabled(btnUpdate, false);
        setHtmlElementDisabled(btnRemove, false);
      } else {
        setHtmlElementDisabled(btnUpdate, true);
        setHtmlElementDisabled(btnRemove, true);
      }
    });
  }

  function showIt(enabled, title, act) {
    if (selectedIdx >= 0) {
      var row = ldata[selectedIdx];
      initElements(enabled);
      iDrayage.val(getStrValue(row.drayage));
      iForklift.val(getStrValue(row.forklift));

      selectedMonth = row.month;
      monthChoice.val(row.month);
      setHtmlElementDisabled(monthChoice, true);
      setHtmlElementDisabled(monthChoiceGrp, true);

      action = act;
      setHtmlElementDisabled(dataBtnOk, false);
      $('#i-title').val(title);
      $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    }
  }

  function initElements(enabled) {
    iDrayage.val('');
    iForklift.val('');
    iDrayage.prop('disabled', enabled);
    iForklift.prop('disabled', enabled);
  }

  function resetTable() {
    dataBody.empty();
    if (ldata.length > 0) {
      var str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td></tr>';
      $.each(ldata, function (idx, row) {
        dataBody.append(str.format(row.month, row.drayage, row.forklift));
      });

      tableBodyEventHandler();
    }
  }

  function getOneData() {
    if (selectedMonth) {
      $.get('/get_one_df_data', {month: selectedMonth}, function (data) {
        var result = jQuery.parseJSON(data);
        if (result.ok) {
          bootbox.alert('不能增加, 记录已存在！月份:' + selectedMonth);
          selectedMonth = '';
          monthChoice.val('');
        }
      });
    } else {
      initElements(false);
    }
  }
});