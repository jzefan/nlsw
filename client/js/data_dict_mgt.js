$(function () {
  var btnAdd = $('#data-add');
  var btnModify = $('#data-modify');
  var btnDelete = $('#data-delete');
  var btnOk = $('#data-btn-ok');
  var dataBody = $('#data-tbody');
  var selectedIdx = -1;
  var currentIdx = -1;

  var more = $('#need-more');
  var addressGroup = $('#address-group');
  var vehInput = $('#veh-input');
  var dictName = $('#dict_name');

  var vehCategory = $('#veh-category');
  var addressInput = $('#address');
  var contactInput = $('#contact');
  var phoneInput = $('#phone');

  var veh_type = '车';
  var el_data_search = $('#data-search');

  var ldata;
  var oper_object = '';
  if ((typeof local_data != 'undefined') && undefined != local_data) {
    ldata = local_data;
    oper_object = local_operObject;

    el_data_search.append(makeOption('所有记录'));
    $.each(ldata, function (idx, row) {
      el_data_search.append(makeOption(row.name));
    });

    el_data_search.select2();
    el_data_search.select2('val', '');

    el_data_search.on('change', function() {
      resetTable(this.value);
    })
  }

  setHtmlElementDisabled(btnModify, true);
  setHtmlElementDisabled(btnDelete, true);
  tableBodyEventHandler();

  var action = '';
  btnAdd.on('click', function() {
    initElements(false);
    if (oper_object != 'brand' && oper_object != 'sale_dep') {
      if (oper_object === 'company') {
        showHtmlElement($('#customer-group'), true);
      } else {
        showHtmlElement($('#customer-group'), false);
      }
      showHtmlElement(more, true);
      if (oper_object === 'vehicle') {
        showHtmlElement(addressGroup, false);
        showHtmlElement(vehInput, true);
      } else {
        showHtmlElement(addressGroup, true);
        showHtmlElement(vehInput, false);
      }
    } else {
      showHtmlElement(more, false);
    }

    action = 'add';
    updateLable('增加');
    $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
  });

  btnModify.on('click', function() {
    showIt(false, '修改', 'modify');
  });

  btnDelete.on('click', function() {
    showIt(true, '删除', 'delete');
  });

  $('#data-export').on('click', function() {
    var html = $('#data-table').html();
    var filename = "download";
    if (oper_object == 'company') {
      filename = "开单名称";
    } else if (oper_object == 'vehicle') {
      filename = "车船号";
    } else if (oper_object == 'destination') {
      filename = "目的地";
    } else if (oper_object == 'warehouse') {
      filename = "仓库";
    } else if (oper_object == 'brand') {
      filename = "牌号";
    } else if (oper_object === 'sale_dep') {
      filename = "销售部门";
    }

    filename += date2Str(new Date()) + ".xls";
    tableToExcel(html, 'data', filename);
  });

  $('#che').on('ifChecked', function() { veh_type = '车' }).on('ifUnchecked', function() { veh_type = '船' });

  function showIt(enabled, title, act) {
    if (currentIdx >= 0) {
      var row = ldata[currentIdx];
      initElements(enabled);
      setElementValue(dictName, row.name);
      dictName.prop('disabled', true);

      if (oper_object === 'brand' || oper_object === 'sale_dep') {
        showHtmlElement(more, false);
      } else {
        showHtmlElement(more, true);
        if (oper_object === 'company') {
          showHtmlElement($('#customer-group'), true);
          $('#customers').val(row.customers);
        } else {
          showHtmlElement($('#customer-group'), false);
        }
        if (oper_object === 'vehicle') {
          showHtmlElement(addressGroup, false);
          showHtmlElement(vehInput, true);
          if (row.veh_category) {
            setElementValue(vehCategory, row.veh_category);
          } else {
            unselected(vehCategory);
          }

          if (row.veh_type === '车') {
            $('#che').iCheck('check')
          } else if (row.veh_type === '船') {
            $('#chuan').iCheck('check');
          } else {
            $('#che').iCheck('uncheck');
            $('#chuan').iCheck('uncheck')
          }
        } else {
          showHtmlElement(addressGroup, true);
          showHtmlElement(vehInput, false);
          setElementValue(addressInput, row.address);
        }

        setElementValue(contactInput, row.contact_name);
        setElementValue(phoneInput, row.phone);
      }

      action = act;
      setHtmlElementDisabled(btnOk, false);
      updateLable(title);
      $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    }
  }

  function nameChanged(elem) {
    var el_same_name = $('#same-name');
    el_same_name.text('');
    var name = elem.val();
    if (name) {
      setHtmlElementDisabled(btnOk, false);
      if (ldata) {
        for (var i = 0; i < ldata.length; ++i) {
          if (name === ldata[i].name) {
            el_same_name.text('名称已存在!');
            setHtmlElementDisabled(btnOk, true);
            break;
          }
        }
      }
    }
  }

  dictName.on('keyup paste blur', function() {
    nameChanged(dictName);
  });

  function updateLable(title) {
    if (oper_object == 'company') {
      $('#lbl-name').text('开单名称');
      $('#dialog-title').text(title + '开单名称');
    } else if (oper_object == 'vehicle') {
      $('#lbl-name').text('车船号');
      $('#dialog-title').text(title + '车船号');
    } else if (oper_object == 'destination') {
      $('#lbl-name').text('目的地');
      $('#dialog-title').text(title + '目的地');
    } else if (oper_object == 'warehouse') {
      $('#lbl-name').text('仓库');
      $('#dialog-title').text(title + '仓库');
    } else if (oper_object == 'brand') {
      $('#lbl-name').text('牌号');
      $('#dialog-title').text(title + '牌号');
    } else if (oper_object === 'sale_dep') {
      $('#lbl-name').text('销售部门');
      $('#dialog-title').text(title + '销售部门');
    }
  }

  btnOk.on('click', function() {
    if (action == 'add') {
      if (oper_object == 'company') {
        addData('/datamgt/company_add', '添加开单名称');
      } else if (oper_object == 'vehicle') {
        addData('/datamgt/vehicle_add', '添加车船号');
      } else if (oper_object == 'warehouse') {
        addData('/datamgt/warehouse_add', '添加仓库');
      } else if (oper_object == 'destination') {
        addData('/datamgt/destination_add', '添加目的地');
      } else if (oper_object == 'brand') {
        addData('/datamgt/brand_add', '添加牌号');
      } else if (oper_object == 'sale_dep') {
        addData('/datamgt/sale_dep_add', '添加销售部门');
      }
    } else if (action == 'modify') {
      var row = ldata[currentIdx];
      if (oper_object === 'brand' || oper_object === 'sale_dep') {

      } else {
        var contact_name = getElementValue(contactInput);
        var phone = getElementValue(phoneInput);
        if (oper_object === 'vehicle') {
          var category = getElementValue(vehCategory);
          if (contact_name != row.contact_name || phone != row.phone || veh_type != row.veh_type || category != row.veh_category) {
            modifyData('/datamgt/vehicle_modify', '修改车船号');
          }
        } else {
          var address = getElementValue(addressInput);
          if (oper_object == 'company') {
            modifyData('/datamgt/company_modify', '修改开单名称');
          } else if (address != row.address || contact_name != row.contact_name || phone != row.phone) {
            if (oper_object == 'warehouse') {
              modifyData('/datamgt/warehouse_modify', '修改仓库');
            } else if (oper_object == 'destination') {
              modifyData('/datamgt/destination_modify', '修改目的地');
            }
          }
        }
      }
    } else if (action === 'delete') {
      var n = ldata[currentIdx].name;
      if (oper_object === 'company') {
        deleteData('/datamgt/company_delete', {name: n}, '删除开单名称');
      } else if (oper_object === 'vehicle') {
        deleteData('/datamgt/vehicle_delete', {name: n}, '删除车船号');
      } else if (oper_object === 'warehouse') {
        deleteData('/datamgt/warehouse_delete', {name: n}, '删除仓库');
      } else if (oper_object === 'destination') {
        deleteData('/datamgt/destination_delete', {name: n}, '删除目的地');
      } else if (oper_object === 'brand') {
        deleteData('/datamgt/brand_delete', {name: n}, '删除牌号');
      } else if (oper_object === 'sale_dep') {
        deleteData('/datamgt/sale_dep_delete', {name: n}, '删除销售部门');
      }
    }
  });

  function deleteData(route, data, msg) {
    ajaxRequestHandle(route, 'POST', data, msg, function () {
      ldata.remove(currentIdx);
      selectedIdx = -1;
      currentIdx = -1;
      resetTable(null);
      $('#data-dialog').modal('hide');
    });
  }

  function getData() {
    if (oper_object === 'brand' || oper_object === 'sale_dep') {
      return { name : dictName.val() };
    } else if (oper_object === 'vehicle') {
      return {
        name : dictName.val(),
        veh_type : veh_type,
        veh_category: vehCategory.val(),
        contact_name : contactInput.val(),
        phone : phoneInput.val()
      }
    } else if (oper_object === 'company') {
      var customers = [];
      var temp = $('#customers').val();
      if (!isEmpty(temp)) {
        customers = temp.split(/[,，\r\n]/);
      }
      return {
        name : dictName.val(),
        customers: customers,
        contact_name : contactInput.val(),
        phone : phoneInput.val(),
        address : addressInput.val()
      }
    } else {
      return {
        name : dictName.val(),
        contact_name : contactInput.val(),
        phone : phoneInput.val(),
        address : addressInput.val()
      }
    }
  }

  function addData(route, msg) {
    var data = getData();
    ajaxRequestHandle(route, 'POST', data, msg, function() {
      if (ldata) {
        ldata.push(data);
        resetTable(null);
      }

      $('#data-dialog').modal('hide');
    });
  }

  function modifyData(route, msg) {
    var data = getData();
    ajaxRequestHandle(route, 'POST', data, msg, function() {
      if (ldata && currentIdx >= 0) {
        ldata[currentIdx].contact_name = data.contact_name;
        ldata[currentIdx].phone = data.phone;
        var str = '<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td>'.format(currentIdx + 1, data.name, data.contact_name, data.phone);
        if (oper_object === 'vehicle') {
          ldata[currentIdx].veh_type = data.veh_type;
          ldata[currentIdx].veh_category = data.veh_category;
          str = '<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td>'.format(currentIdx + 1, data.name, data.veh_type, data.veh_category, data.contact_name, data.phone);
        } else if (oper_object === 'company') {
          ldata[currentIdx].customers = data.customers;
          ldata[currentIdx].address = data.address;
          str = '<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td>'.format(currentIdx + 1, data.name, data.customers, data.address, data.contact_name, data.phone);
        } else {
          ldata[currentIdx].address = data.address;
          str = '<td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td>'.format(currentIdx + 1, data.name, data.address, data.contact_name, data.phone);
        }
        dataBody.find('tr').eq(selectedIdx).html(str);
      }

      $('#data-dialog').modal('hide');
    });
  }

  function resetTable(filter) {
    dataBody.empty();
    if (ldata.length > 0) {
      var str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td></tr>';
      if (oper_object === 'brand' || oper_object === 'sale_dep') {
        str = '<tr><td>{0}</td><td>{1}</td></tr>';
        $.each(ldata, function (idx, row) {
          if (!filter || filter === '所有记录' || row.name.indexOf(filter) >= 0) {
            dataBody.append(str.format(idx + 1, row.name));
          }
        });
      } else if (oper_object === 'company') {
        str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td></tr>';
        $.each(ldata, function (idx, row) {
          if (!filter || filter === '所有记录' || row.name.indexOf(filter) >= 0) {
            dataBody.append(str.format(idx + 1, row.name, row.customers,
              row.address ? row.address : '', row.contact_name ? row.contact_name : '', row.phone ? row.phone : ''));
          }
        });
      } else if (oper_object === 'vehicle') {
        str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td><td>{5}</td></tr>';
        $.each(ldata, function (idx, row) {
          if (!filter || filter === '所有记录' || row.name.indexOf(filter) >= 0) {
            dataBody.append(str.format(idx + 1, row.name, row.veh_type ? row.veh_type : '', row.veh_category ? row.veh_category : '', row.contact_name ? row.contact_name : '', row.phone ? row.phone : ''));
          }
        });
      } else {
        str = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td></tr>';
        $.each(ldata, function (idx, row) {
          if (!filter || filter === '所有记录' || row.name.indexOf(filter) >= 0) {
            dataBody.append(str.format(idx + 1, row.name,
              row.address ? row.address : '', row.contact_name ? row.contact_name : '', row.phone ? row.phone : ''));
          }
        });
      }

      tableBodyEventHandler();
    }
  }

  function tableBodyEventHandler() {
    tr_click(dataBody.find('tr'), function (e, index) {
      selectedIdx = index;
      var me = $(e.currentTarget);
      currentIdx = parseInt(getTableCellChildren(me, 0).text()) - 1;
      if (selectedIdx >= 0) {
        setHtmlElementDisabled(btnModify, false);
        setHtmlElementDisabled(btnDelete, false);
      } else {
        setHtmlElementDisabled(btnModify, true);
        setHtmlElementDisabled(btnDelete, true);
      }
    });
  }

  function initElements(enabled) {
    var el_data_input = $('#data-input');
    var allInput = el_data_input.find('input');
    var allTextArea = el_data_input.find('textarea');
    allInput.val('');
    allInput.prop('disabled', enabled);
    allTextArea.val('');
    allTextArea.prop('disabled', enabled);
  }
});