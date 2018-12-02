/**
 * Created by ezefjia on 2015/4/27.
 */

$(function () {
  var uname = $('#u-name');
  var uRealName = $('#u-real-name');
  var uTitle = $('#employee-title');
  var uPhone = $('#u-phone');
  var dataOk = $('#data-btn-ok');

  var pAdmin = $('#p-admin');
  var pOperator = $('#p-operator');
  var pAccount = $('#p-account');
  var pStatistics = $('#p-statistics');
  var pVesselRevenue = $('#p-vessel-revenue');
  var pCustRevenue = $('#p-cust-revenue');
  var isAdmin = false, isOperator = false, isAccount = false, isStatistics = false, isRevenue = false;
  var isCustRevenue = false, isVesselRevenue = false;

  var tbody = $('#data-tbody');
  var dbUsers = local_data;
  var action = '';
  var selectedUser;
  var title_name = [ 'ceo', 'mgr', 'operator', 'account', 'statistician'];
  var title_name_cn = [ '董事长', '经理', '业务员', '会计', '统计员'];

  resetTable();
  dialogInit();

  pAdmin.on('ifChecked', function() {
    adminCheck(false);
    okEnabled(false);
  });
  pAdmin.on('ifUnchecked', function() {
    isAdmin = false;
    okEnabled(false);
  });

  pOperator.on('ifChecked', function() {
    isOperator = true;
    adminUncheck();
    okEnabled(false);
  });
  pOperator.on('ifUnchecked', function() {
    isOperator = false;
    okEnabled(false);
  });

  pAccount.on('ifChecked', function() {
    isAccount = true;
    adminUncheck();
    okEnabled(false);
  });
  pAccount.on('ifUnchecked', function() {
    isAccount = false;
    okEnabled(false);
  });

  pStatistics.on('ifChecked', function() {
    isStatistics = true;
    adminUncheck();
    okEnabled(false);
  });
  pStatistics.on('ifUnchecked', function() {
    isStatistics = false;
    okEnabled(false);
  });

  pCustRevenue.on('ifChecked', function() { isCustRevenue = true; adminUncheck(); okEnabled(false); });
  pCustRevenue.on('ifUnchecked', function() { isCustRevenue = false; okEnabled(false); });

  pVesselRevenue.on('ifChecked', function() { isVesselRevenue = true; adminUncheck(); okEnabled(false); });
  pVesselRevenue.on('ifUnchecked', function() { isVesselRevenue = false; okEnabled(false); });

  var same_name = $('#same-name');
  uname.on('keyup paste', function() {
    var same = false;
    var name = uname.val();
    if (!isEmpty(name)) {
      for (var i = 0; i < dbUsers.length; ++i) {
        if (name === dbUsers[i].userid) {
          same_name.text('此用户名已注册!');
          same = true;
          break;
        }
      }
    }

    if (!same) {
      okEnabled(false);
      same_name.text('');
    }
  });

  uTitle.on('change', function() {
    var v = uTitle.val();
    if (v === 'ceo' || v === 'mgr') {
      adminCheck(true);
    } else {
      adminUncheck();

      if (v === 'operator') {
        isOperator = true;
        pOperator.iCheck('check');
        pAccount.iCheck('uncheck');
        pStatistics.iCheck('uncheck');
      } else if (v === 'account') {
        isAccount = true;
        pOperator.iCheck('uncheck');
        pAccount.iCheck('check');
        pStatistics.iCheck('uncheck');
      } else if (v === 'statistician') {
        isStatistics = true;
        pOperator.iCheck('uncheck');
        pAccount.iCheck('uncheck');
        pStatistics.iCheck('check');
      }
    }

    okEnabled(false);
  });

  uRealName.on('keyup paste', function() {
    if (action === 'modify') {
      okEnabled(true);
    }
  });

  uPhone.on('keyup paste', function() {
    if (action === 'modify') {
      okEnabled(true);
    }
  });

  function getPrivlege(privilege) {
    if (privilege === '11111111') {
      return '管理';
    } else if (privilege) {
      var pri = '';
      if (privilege[0] === '1') {
        pri = '业务';
      }
      if (privilege[1] === '1') {
        if (pri) {
          pri += ',统计';
        } else {
          pri = '统计';
        }
      }
      if (privilege[2] === '1') {
        if (pri) {
          pri += ',会计';
        } else {
          pri = '会计';
        }
      }
      if (privilege[4] === '1') {
        if (pri) {
          pri += ',客户营业额';
        } else {
          pri = '客户营业额';
        }
      }
      if (privilege[5] === '1') {
        if (pri) {
          pri += ',车船营业额';
        } else {
          pri = '车船营业额';
        }
      }

      return pri;
    } else {
      return '';
    }
  }

  function okEnabled(ext) {
    var name = uname.val();
    var realName = uRealName.val();
    var title = uTitle.val();
    var phone = uPhone.val();
    if (ext) {
      setHtmlElementDisabled(dataOk, (isEmpty(name) || isEmpty(title) || isEmpty(realName) || isEmpty(phone) || (!isAdmin && !isOperator && !isAccount && !isStatistics && !isCustRevenue && !isVesselRevenue)));
    } else {
      setHtmlElementDisabled(dataOk, (isEmpty(name) || isEmpty(title) || (!isAdmin && !isOperator && !isAccount && !isStatistics && !isCustRevenue && !isVesselRevenue)));
    }
  }

  function adminCheck(needed) {
    isAdmin = true;
    if (needed) {
      pAdmin.iCheck('check');
    }

    if (isOperator) {
      isOperator = false;
      pOperator.iCheck('uncheck');
    }
    if (isAccount) {
      isAccount = false;
      pAccount.iCheck('uncheck');
    }
    if (isStatistics) {
      isStatistics = false;
      pStatistics.iCheck('uncheck');
    }
    if (isCustRevenue) {
      isCustRevenue = false;
      pCustRevenue.iCheck('uncheck');
    }
    if (isVesselRevenue) {
      isVesselRevenue = false;
      pVesselRevenue.iCheck('uncheck');
    }
  }

  function adminUncheck() {
    if (isAdmin) {
      isAdmin = false;
      pAdmin.iCheck('uncheck');
    }
  }

  function dialogInit() {
    uname.val('');
    uRealName.val('');
    uPhone.val('');
    uTitle.prop('selectedIndex', 0);
    pAdmin.iCheck('uncheck');
    pOperator.iCheck('uncheck');
    pAccount.iCheck('uncheck');
    pStatistics.iCheck('uncheck');
    pCustRevenue.iCheck('uncheck');
    pVesselRevenue.iCheck('uncheck');
  }

  function resetTable() {
    tbody.empty();
    var s = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td></tr>';
    dbUsers.forEach(function(u) {
      tbody.append(s.format(u.userid, u.name, u.title ? u.title : '', getPrivlege(u.privilege), u.phone));
    });

    tbody.find('tr').on('click', function () {
      tbody.find('tr').removeClass('invoice-highlighted');
      var me = $(this);
      var user = dbUsers[me.index()];
      if (selectedUser && user.userid === selectedUser.userid) {
        selectedUser = undefined;
      } else {
        selectedUser = user;
        me.addClass('invoice-highlighted');
      }
    });
  }

  $('#data-add').on('click', function() {
    ajaxRequestHandle('/initial_settle_flag', 'POST', {}, 'update', function() {
      bootbox.alert("OK");
    })
    /*
    action = 'add';
    dialogInit();
    $('#dialog-title').text('新建用户');
    showHtmlElement($('#pwd-hint'), true);
    setHtmlElementDisabled(uname, false);
    $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    */
  });

  $('#data-delete').on('click', function() {
    if (selectedUser) {
      ajaxRequestHandle('/user_mgr', 'POST', {act: 'delete', userid: selectedUser.userid}, '删除用户', function() {
        for (var i = 0; i < dbUsers.length; ++i) {
          if (dbUsers[i].userid === selectedUser.userid) {
            dbUsers.remove(i);
            selectedUser = undefined;
            break;
          }
        }

        resetTable();
        $('#data-dialog').modal('hide');
      });
    } else {
      bootbox.alert('请选择某一用户');
    }
  });

  $('#data-modify').on('click', function() {
    if (selectedUser) {
      action = 'modify';
      uname.val(selectedUser.userid);
      uRealName.val(selectedUser.name? selectedUser.name : '');
      uPhone.val(selectedUser.phone ? selectedUser.phone : '');

      if (selectedUser.privilege === '11111111') {
        adminCheck(true);
      } else if (selectedUser.privilege) {
        adminUncheck();

        if (selectedUser.privilege[0] === '1') {
          pOperator.iCheck('check');
          isOperator = true;
        }
        if (selectedUser.privilege[1] === '1') {
          pStatistics.iCheck('check');
          isStatistics = true;
        }
        if (selectedUser.privilege[2] === '1') {
          pAccount.iCheck('check');
          isAccount = true;
        }
        //if (selectedUser.privilege[3] === '1') {
        //  pRevenue.iCheck('check');
        //  isRevenue = true;
        //}
        if (selectedUser.privilege[4] === '1') {
          pCustRevenue.iCheck('check');
          isCustRevenue = true;
        }
        if (selectedUser.privilege[5] === '1') {
          pVesselRevenue.iCheck('check');
          isVesselRevenue = true;
        }
      }

      var idx = title_name_cn.indexOf(selectedUser.title);
      uTitle.val( (idx>=0) ? title_name[idx] : '');

      $('#dialog-title').text('修改用户');
      showHtmlElement($('#pwd-hint'), false);
      setHtmlElementDisabled(uname, true);
      $('#data-dialog').modal({ backdrop: 'static', keyboard: false}).modal('show');
    } else {
      bootbox.alert('请选择某一用户');
    }
  });

  dataOk.on('click', function() {
    var name = uname.val();
    var realName = uRealName.val();
    var title = uTitle.val();
    var phone = uPhone.val();
    var privilege = '';

    if (isAdmin) {
      privilege = '11111111';
    } else {
      privilege += isOperator ? '1' : '0';
      privilege += isStatistics ? '1' : '0';
      privilege += isAccount ? '1' : '0';
      privilege += isCustRevenue && isVesselRevenue ? '1' : '0';
      privilege += isCustRevenue ? '1' : '0';
      privilege += isVesselRevenue ? '1' : '0';
      privilege += '00';
    }

    var idx = title_name.indexOf(title);
    title = (idx >= 0) ? title_name_cn[idx] : '';

    var data = {
      userid: name,
      name: isEmpty(realName) ? '' : realName,
      title: title,
      phone: isEmpty(phone) ? '' : phone,
      privilege: privilege
    };

    ajaxRequestHandle('/user_mgr', 'POST', {act: action, data: data}, '新建用户', function() {
      if (dbUsers) {
        if (action === 'add') {
          dbUsers.push(data);
        } else {
          for (var i = 0; i < dbUsers.length; ++i) {
            if (name === dbUsers[i].userid) {
              dbUsers[i].name = data.name;
              dbUsers[i].title = title;
              dbUsers[i].phone = phone;
              dbUsers[i].privilege = privilege;
              break;
            }
          }
        }
        resetTable();
      }

      $('#data-dialog').modal('hide');
    });
  });

  $('#data-export').on('click', function() {
    var html = $('#data-table').html();
    tableToExcel(html, 'data', '');
  });
});