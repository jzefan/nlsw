const Company = require('../../models/Company');
const { buildTenantQuery } = require('../../utils/tenant');

// 快速搜索接口 - 专门用于下拉列表等场景
// 使用聚合管道直接获取去重的名称列表，避免查询完整文档
exports.searchCompanies = async (req, res) => {
  try {
    const search = req.query.search || '';
    const limit = parseInt(req.query.limit) || 20;

    const pipeline = [];

    // 第一步：租户过滤（必须在最前面）
    const matchStage = {};
    if (req.tenantId) {
      matchStage.tenantId = req.tenantId;
    }

    // 第二步：名称搜索（使用前缀匹配优化性能）
    if (search) {
      // 使用前缀匹配，可以利用索引
      matchStage.name = { $regex: `^${search}`, $options: 'i' };
    }

    pipeline.push({ $match: matchStage });

    // 第三步：只选择 name 字段并去重
    pipeline.push({
      $group: {
        _id: '$name'
      }
    });

    // 第四步：排序
    pipeline.push({ $sort: { _id: 1 } });

    // 第五步：限制结果数量
    pipeline.push({ $limit: limit });

    // 第六步：格式化输出
    pipeline.push({
      $project: {
        _id: 0,
        name: '$_id'
      }
    });

    const companies = await Company.aggregate(pipeline);

    res.json({
      ok: true,
      data: companies
    });
  } catch (error) {
    console.error('searchCompanies error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};

exports.getCompanies = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const skipCount = req.query.skipCount === 'true';

    const baseQuery = {};
    if (search) {
      baseQuery.name = { $regex: search, $options: 'i' };
    }

    const query = buildTenantQuery(req, baseQuery);

    // 对于搜索场景（如下拉列表），跳过耗时的 countDocuments 查询
    // 可通过 skipCount=true 参数显式跳过，或在搜索模式下自动跳过
    const shouldSkipCount = skipCount || (search && limit <= 50);

    let count = 0;
    if (!shouldSkipCount) {
      count = await Company.countDocuments(query);
    }

    const companies = await Company.find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ create_time: -1 })
      .select('name customers contact_name phone address')
      .lean();

    res.json({
      ok: true,
      data: companies,
      total: shouldSkipCount ? -1 : count,
      page: page,
      totalPages: shouldSkipCount ? -1 : Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('getCompanies error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
};
