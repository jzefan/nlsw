# 运单报告抬头可修改任务

- [x] 梳理相关前后端代码与可复用的数据存储位置
- [x] 确认实现设计：按运单维度保存报表抬头，支持从该开单名称的发货单位候选中选择或手输
- [x] 为运单接口补充报表抬头字段读写
- [x] 在运单报告页面增加抬头选择/输入与保存能力
- [x] 让打印与导出使用用户保存后的抬头，默认仍为物流公司抬头
- [x] 运行验证并记录结果

## Review

- 后端加载校验通过：`node -e "require('./models/Invoice'); require('./controllers/api/invoice'); require('./routes_api'); console.log('backend ok')"`
- 前端类型校验通过：`pnpm exec vue-tsc -b`
- `pnpm build` 未完成，失败原因是当前环境文件句柄限制触发 `EMFILE: too many open files, watch`，不是本次代码的显式编译报错
