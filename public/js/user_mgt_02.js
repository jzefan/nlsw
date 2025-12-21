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
  var pSelfVehicle = $('#p-self-vehicle');
  var pSeePrice = $('#p-see-price')
  var isAdmin = false, isOperator = false, isAccount = false, isStatistics = false, isRevenue = false;
  var isCustRevenue = false, isVesselRevenue = false, isSelfVehicle = false, isSeePrice = false;

  var tbody = $('#data-tbody');
  var dbUsers = local_data;
  var action = '';
  var selectedUser;
  var title_name = ['ceo', 'mgr', 'operator', 'account', 'statistician'];
  var title_name_cn = ['董事长', '经理', '业务员', '会计', '统计员'];

  let btnResetPasswd = $('#reset-passwd')

  $('#search-tool').hide();

  resetTable();
  dialogInit();

  pAdmin.change(function () {
    if ($(this).is(':checked')) {
      adminCheck(false);
    } else {
      adminUncheck();
      isAdmin = false;
    }
    okEnabled(false);
  })

  pOperator.change(function () { isOperator = $(this).is(':checked'); okEnabled(false); })
  pAccount.change(function () { isAccount = $(this).is(':checked'); okEnabled(false); })
  pStatistics.change(function () { isStatistics = $(this).is(':checked'); okEnabled(false); })
  pCustRevenue.change(function () { isCustRevenue = $(this).is(':checked'); okEnabled(false); })
  pVesselRevenue.change(function () { isVesselRevenue = $(this).is(':checked'); okEnabled(false); })
  pSelfVehicle.change(function () { isSelfVehicle = $(this).is(':checked'); okEnabled(false); })
  pSeePrice.change(function () { isSeePrice = $(this).is(':checked'); okEnabled(false); })

  var same_name = $('#same-name');
  uname.on('keyup paste', function () {
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

  uTitle.on('change', function () {
    var v = uTitle.val();
    if (v === 'ceo' || v === 'mgr') {
      adminCheck(true);
    } else {
      adminUncheck();

      if (v === 'operator') {
        isOperator = true;
        pOperator.prop('checked', true);
        pAccount.prop('checked', false);
        pStatistics.prop('checked', false);
      } else if (v === 'account') {
        isAccount = true;
        pOperator.prop('checked', false);
        pAccount.prop('checked', true);
        pStatistics.prop('checked', false);
      } else if (v === 'statistician') {
        isStatistics = true;
        pOperator.prop('checked', false);
        pAccount.prop('checked', false);
        pStatistics.prop('checked', true);
      }
    }

    okEnabled(false);
  });

  uRealName.on('keyup paste', function () {
    if (action === 'modify') {
      okEnabled(true);
    }
  });

  uPhone.on('keyup paste', function () {
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
      if (privilege[6] === '1') {
        if (pri) {
          pri += ',自有车管理';
        } else {
          pri = '自有车管理';
        }
      }
      if (privilege[7] === '1') {
        if (pri) {
          pri += ',查看价格';
        } else {
          pri = '查看价格';
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
      setHtmlElementDisabled(dataOk, (isEmpty(name) || isEmpty(title) || isEmpty(realName) || isEmpty(phone) ||
        (!isAdmin && !isOperator && !isAccount && !isStatistics && !isCustRevenue && !isVesselRevenue && !isSelfVehicle)));
    } else {
      setHtmlElementDisabled(dataOk, (isEmpty(name) || isEmpty(title) ||
        (!isAdmin && !isOperator && !isAccount && !isStatistics && !isCustRevenue && !isVesselRevenue && !isSelfVehicle)));
    }
  }

  function adminCheck(needed) {
    isAdmin = true;
    pAdmin.prop('checked', true)
    pOperator.prop('disabled', true);
    pAccount.prop('disabled', true);
    pStatistics.prop('disabled', true);
    pCustRevenue.prop('disabled', true);
    pVesselRevenue.prop('disabled', true);
    pSelfVehicle.prop('disabled', true);
    pSeePrice.prop('disabled', true);

    if (isOperator) {
      isOperator = false;
      pOperator.prop('checked', false);
    }
    if (isAccount) {
      isAccount = false;
      pAccount.prop('checked', false);
    }
    if (isStatistics) {
      isStatistics = false;
      pStatistics.prop('checked', false);
    }
    if (isCustRevenue) {
      isCustRevenue = false;
      pCustRevenue.prop('checked', false);
    }
    if (isVesselRevenue) {
      isVesselRevenue = false;
      pVesselRevenue.prop('checked', false);
    }
    if (isSelfVehicle) {
      isSelfVehicle = false;
      pSelfVehicle.prop('checked', false);
    }
    if (isSeePrice) {
      isSeePrice = false;
      pSeePrice.prop('checked', false);
    }
  }

  function adminUncheck() {
    if (isAdmin) {
      isAdmin = false;
      pAdmin.prop('checked', false)
      pOperator.prop('disabled', false);
      pAccount.prop('disabled', false);
      pStatistics.prop('disabled', false);
      pCustRevenue.prop('disabled', false);
      pVesselRevenue.prop('disabled', false);
      pSelfVehicle.prop('disabled', false);
      pSeePrice.prop('disabled', false);
    }
  }

  function dialogInit() {
    uname.val('');
    uRealName.val('');
    uPhone.val('');
    uTitle.prop('selectedIndex', 0);

    pAdmin.prop('checked', false);
    pOperator.prop('checked', false);
    pAccount.prop('checked', false);
    pStatistics.prop('checked', false);
    pCustRevenue.prop('checked', false);
    pVesselRevenue.prop('checked', false);
    pSelfVehicle.prop('checked', false);
    pSeePrice.prop('checked', false);
    pAdmin.prop('disabled', false);
    pOperator.prop('disabled', false);
    pAccount.prop('disabled', false);
    pStatistics.prop('disabled', false);
    pCustRevenue.prop('disabled', false);
    pVesselRevenue.prop('disabled', false);
    pSelfVehicle.prop('disabled', false);
    pSeePrice.prop('disabled', false);
  }

  function resetTable() {
    tbody.empty();
    var s = '<tr><td>{0}</td><td>{1}</td><td>{2}</td><td>{3}</td><td>{4}</td></tr>';
    dbUsers.forEach(function (u) {
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

  btnResetPasswd.on('click', function () {
    if (!selectedUser) {
      bootbox.alert('请选择要重置的用户!');
    } else {
      ajaxRequestHandle('/resetPwd', 'POST', { user: selectedUser }, '重置密码', function () {
        bootbox.alert(`成功重置用户${selectedUser.name}的密码!`)
        tbody.find('tr').removeClass('invoice-highlighted');
        selectedUser = undefined;
      })
    }
  })

  $('#data-add').on('click', function () {
    // ajaxRequestHandle('/initial_settle_flag', 'POST', {}, 'update', function() {
    //   bootbox.alert("OK");
    // })
    action = 'add';
    dialogInit();
    $('#dialog-title').text('新建用户');
    showHtmlElement($('#pwd-hint'), true);
    setHtmlElementDisabled(uname, false);
    $('#data-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
  });

  $('#data-delete').on('click', function () {
    if (selectedUser) {
      bootbox.confirm('确定删除当前选择的用户?', function (result) {
        if (result) {
          ajaxRequestHandle('/user_mgr', 'POST', { act: 'delete', userid: selectedUser.userid }, '删除用户', function () {
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
        }
      });
    } else {
      bootbox.alert('请选择某一用户');
    }
  });

  $('#data-modify').on('click', function () {
    if (selectedUser) {
      action = 'modify';
      uname.val(selectedUser.userid);
      uRealName.val(selectedUser.name ? selectedUser.name : '');
      uPhone.val(selectedUser.phone ? selectedUser.phone : '');

      if (selectedUser.privilege === '11111111') {
        adminCheck(true);
      } else if (selectedUser.privilege) {
        adminUncheck();

        if (selectedUser.privilege[0] === '1') {
          pOperator.prop('checked', true);
          isOperator = true;
        }
        if (selectedUser.privilege[1] === '1') {
          pStatistics.prop('checked', true);
          isStatistics = true;
        }
        if (selectedUser.privilege[2] === '1') {
          pAccount.prop('checked', true);
          isAccount = true;
        }
        //if (selectedUser.privilege[3] === '1') {
        //  pRevenue.prop('check');
        //  isRevenue = true;
        //}
        if (selectedUser.privilege[4] === '1') {
          pCustRevenue.prop('checked', true);
          isCustRevenue = true;
        }
        if (selectedUser.privilege[5] === '1') {
          pVesselRevenue.prop('checked', true);
          isVesselRevenue = true;
        }
        if (selectedUser.privilege[6] === '1') {
          pSelfVehicle.prop('checked', true);
          isSelfVehicle = true;
        }
        if (selectedUser.privilege[7] === '1') {
          pSeePrice.prop('checked', true);
          isSeePrice = true;
        }
      }

      var idx = title_name_cn.indexOf(selectedUser.title);
      uTitle.val((idx >= 0) ? title_name[idx] : '');

      $('#dialog-title').text('修改用户');
      showHtmlElement($('#pwd-hint'), false);
      setHtmlElementDisabled(uname, true);
      $('#data-dialog').modal({ backdrop: 'static', keyboard: false }).modal('show');
    } else {
      bootbox.alert('请选择某一用户');
    }
  });

  dataOk.on('click', function () {
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
      privilege += isSelfVehicle ? '1' : '0';
      privilege += isSeePrice ? '1' : '0';
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

    ajaxRequestHandle('/user_mgr', 'POST', { act: action, data: data }, '新建用户', function () {
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

  $('#data-export').on('click', function () {
    var html = $('#data-table').html();
    tableToExcel(html, 'data', '');
  });
});