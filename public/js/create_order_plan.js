$(function(){"use strict";var d,a="undefined"!=typeof FileReader&&void 0!==FileReader.prototype&&void 0!==FileReader.prototype.readAsBinaryString,s="undefined"!=typeof Worker,p=!0,i=$("#order-no"),l=$("#order-weight"),c=$("#customer-name"),g=$("#customer-code"),u=$("#destination"),m=$("#transport-mode"),f=$("#consignee"),v=$("#ds-client"),h=$("#contract-no"),y=$("#customer-saleman"),S=$("#receiving-charge"),b=$("#consigner"),e=$("#input-plan-content"),x=$("#order-input-time"),_=[];c.select2(),u.select2();var E=["order_no","order_weight","customer_code","destination","customer_name","ds_client","transport_mode","customer_saleman","consigner","status","contract_no","receiving_charge","consignee"],w={"订单号":0,"订单":0,"订单量":1,"客户代码":2,"流向":3,"发货目的地":3,"客户名称":4,"下游客户":5,"运输方式":6,"南钢业务员":7,"客户业务员":7,"业务员":8,"订单状态":9,"合同号":10,"运价":11,"接单价":11,"收货人":12};$("#import-file").on("change",function(e){e.stopPropagation(),e.preventDefault(),0<e.target.files.length&&(nlApp.setTitle("读取文件,请稍等..."),nlApp.showPleaseWait(),function(e){_=[];for(var t=0;t<e.length;++t){o=e[t];var r=new FileReader,n=o.name.split(".").pop().toLowerCase();d=(p="xlsx"===n)?XLSX:XLS,r.onload=function(e){var t=e.target.result;if(s)A(t,N);else{var r=a?d.read(t,{type:"binary"}):d.read(btoa(C(t)),{type:"base64"});N(r)}},a?r.readAsBinaryString(o):r.readAsArrayBuffer(o)}}(e.target.files))});var o,k=[{msg:"xls",rABS:"../js/plugins/sheetJS/XLS/xlsworker2.js",norABS:"../js/plugins/sheetJS/XLS/xlsworker1.js",noxfer:"../js/plugins/sheetJS/XLS/xlsworker.js"},{msg:"xlsx",rABS:"../js/plugins/sheetJS/XLSX/xlsxworker2.js",norABS:"../js/plugins/sheetJS/XLSX/xlsxworker1.js",noxfer:"../js/plugins/sheetJS/XLSX/xlsxworker.js"}];function A(e,r){var t;if(s)if((t=p?new Worker(a?k[1].rABS:k[1].norABS):new Worker(a?k[0].rABS:k[0].norABS)).onmessage=function(e){switch(e.data.t){case"ready":break;case"e":console.error(e.data.d);break;default:var t=function(e){for(var t="",r=0,n=10240;r<e.byteLength/n;++r)t+=String.fromCharCode.apply(null,new Uint16Array(e.slice(r*n,r*n+n)));return t+=String.fromCharCode.apply(null,new Uint16Array(e.slice(r*n)))}(e.data).replace(/\n/g,"\\n").replace(/\r/g,"\\r");console.log("done"),r(JSON.parse(t))}},a){var n=function(e){for(var t=new ArrayBuffer(2*e.length),r=new Uint16Array(t),n=0;n!=e.length;++n)r[n]=e.charCodeAt(n);return[r,t]}(e);t.postMessage(n[1],[n[1]])}else t.postMessage(e,[e]);else{(t=p?new Worker(k[1].noxfer):new Worker(k[0].noxfer)).onmessage=function(e){switch(e.data.t){case"ready":break;case"e":console.error(e.data.d);break;case"xlsx":case"xls":r(JSON.parse(e.data.d))}};var o=a?e:btoa(C(e));t.postMessage({d:o,b:a})}}function C(e){for(var t="",r=0,n=10240;r<e.byteLength/n;++r)t+=String.fromCharCode.apply(null,new Uint8Array(e.slice(r*n,r*n+n)));return t+=String.fromCharCode.apply(null,new Uint8Array(e.slice(r*n)))}function N(e){var l,c;p||"undefined"==typeof Worker||XLS.SSF.load_table(e.SSF),(c=!0,(l=e).SheetNames.forEach(function(e){var t,r=p?d.utils.sheet_to_csv(l.Sheets[e]):d.utils.make_csv(l.Sheets[e]);if(0<r.length)for(var n=(r=r.replace(/([^"]+)|("[^"]+")/g,function(e,t,r){return r?r.replace(/[\s+""]/g,"").replace(/,/g,"`"):t})).match(/[^\r\n]+/g),o=!1,a=[],s=[],i=0;i<n.length;i++)if(o)j(n[i],a,s);else{if(20<i){c=!1,console.log("No Header found!");break}0<=(t=n[i]).indexOf("订单号")&&(0<=t.indexOf("订单量")&&0<=t.indexOf("客户名称")&&0<=t.indexOf("订单")||0<=t.indexOf("客户代码"))&&(o=!0,a=n[i].split(","),s=a.map(function(e){var t=-1;for(var r in w)if(e===r){t=w[r];break}return-1<t?E[t]:e}))}}),c)?W():bootbox.alert("不正确的Excel数据文件或文件无数据..."),nlApp.hidePleaseWait()}function j(e,t,r){for(var n=e.split(","),o=n.length,a=t.length,s=!0,i=0;i<o;i++)n[i]=$.trim(n[i]).replace(/`/g,","),n[i].length&&(s=!1);if(!s){var l={};if(o<=a){for(var c=0;c<o&&t[c];++c)l[r[c]]=n[c];for(c=o;c<a&&t[c];++c)l[r[c]]=""}else for(i=0;i<a&&t[i];++i)l[r[i]]=n[i];var d=l.order_no,p=parseInt("20"+d.substr(3,2)),g=parseInt(d.substr(5,2));_.push({orderNo:l.order_no,orderWeight:l.order_weight,leftWeight:l.order_weight,customerName:isEmpty(l.customer_name)?"":l.customer_name,entryTime:new Date(p,g),customerCode:isEmpty(l.customer_code)?"":l.customer_code,destination:isEmpty(l.destination)?"":l.destination,transportMode:isEmpty(l.transport_mode)?"":l.transport_mode,consignee:isEmpty(l.consignee)?"":l.consignee,dsClient:isEmpty(l.ds_client)?"":l.ds_client,contractNo:isEmpty(l.contract_no)?"":l.contract_no,salesman:isEmpty(l.customer_saleman)?"":l.customer_saleman,receivingCharge:isEmpty(l.receiving_charge)?"":l.receiving_charge,consigner:isEmpty(l.consigner)?"":l.consigner})}}function t(){i.val(""),l.val(""),c.select2("val",""),g.val(""),u.select2("val",""),m.val("船运"),f.val(""),v.val(""),h.val(""),y.val(""),S.val(""),b.val(""),unselected(c),unselected(u),e.empty(),_=[],x.val("")}function W(){var t="",r=0;_.forEach(function(e){t+=function(e){for(var t='<tr><td style="cursor:pointer" class="td-icon"><i title="删除" class="fa fa-trash-o redlink"></i></td>',r=0;r<13;++r)t+="<td>{"+r+"}</td>";return(t+="</tr>").format(e.orderNo,getStrValue(e.orderWeight),e.customerName,e.customerCode?e.customerCode:"",e.destination?e.destination:"",e.transportMode,e.consignee?e.consignee:"",e.dsClient?e.dsClient:"",e.salesman?e.salesman:"",e.consigner?e.consigner:"",e.contractNo?e.contractNo:"",getStrValue(e.receivingCharge),e.entryTime)}(e),r+=+e.orderWeight}),e.html(t),setElementValue($("#total-weight"),getStrValue(r)),$(".redlink").on("click",function(e){e.stopImmediatePropagation();var t=$(this).closest("tr");_.remove(t.index()),t.remove()})}t(),l.ForceNumericOnly(),S.ForceNumericOnly(),elementEventRegister(i,"blur",function(){var t=$(this),r=t.val();if(11!=r.length)bootbox.alert("当前输入的订单号的长度是"+r.length+"位，长度必须为11位");else{try{var e=parseInt("20"+r.substr(3,2)),n=parseInt(r.substr(5,2));x.val(e+"-"+n)}catch(e){return void bootbox.alert("订单号格式不对，不能读取日期")}$.get("/order_plan_exist",{q:r},function(e){jQuery.parseJSON(e).exist&&(bootbox.alert("此订单号已经存在: "+r),t.val(""))})}}),elementEventRegister($("#ui_input_save"),"click",function(e){e.stopPropagation(),e.preventDefault(),_.length?ajaxRequestHandle("/create_order_plan","POST",_,"数据保存",function(){t(),$("#import-file").val("")}):bootbox.alert("没有数据, 请输入或导入!")}),elementEventRegister($("#add-one"),"click",function(){var e=i.val(),t=l.val(),r=c.val(),n=x.val();if(isEmpty(e))bootbox.alert("请输入订单号");else if(11!=e.length)bootbox.alert("订单号的长度必须是11位, 当前输入长度为："+e.length);else if(isEmpty(t))bootbox.alert("请输入订单量");else if(isEmpty(r))bootbox.alert("请输入客户名称");else if(isEmpty(n))bootbox.alert("请输入录单时间");else{for(var o=!0,a=0;a<_.length;++a)if(_[a].orderNo===e){bootbox.alert("不唯一, 订单号相同"),o=!1;break}o&&(_.push({orderNo:e,orderWeight:t,leftWeight:t,customerName:r,entryTime:n,customerCode:isEmpty(g.val())?"":g.val(),destination:isEmpty(u.val())?"":u.val(),transportMode:isEmpty(m.val())?"":m.val(),consignee:isEmpty(f.val())?"":f.val(),dsClient:isEmpty(v.val())?"":v.val(),contractNo:isEmpty(h.val())?"":h.val(),salesman:isEmpty(y.val())?"":y.val(),receivingCharge:isEmpty(S.val())?"":S.val(),consigner:isEmpty(b.val())?"":b.val()}),W())}})});
//# sourceMappingURL=create_order_plan.js.map