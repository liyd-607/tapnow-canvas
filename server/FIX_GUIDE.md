# TapNow Canvas 后端修复计划

## 问题概述
后端服务启动失败，共有38个TypeScript类型错误，主要分为以下几类：

1. **枚举值大小写不匹配**：代码中使用小写字符串，但枚举定义为大写常量
2. **字段名称不匹配**：schema中重命名了字段（如type → modelType），但代码中仍使用旧名称
3. **缺少必填字段**：如Canvas模型缺少tenantId字段
4. **自定义字段不存在**：User模型中不存在tapies字段
5. **关系配置错误**：如SmsCode缺少tenantId字段

## 修复步骤

### 1. 修复Agent模块枚举错误
```bash
# 修改agent.service.ts中的状态字符串为大写
sed -i '' 's/status: '\''planning'\''/status: '\''PLANNING'\''/' src/modules/agent/agent.service.ts
sed -i '' 's/status: '\''predicting_shots'\''/status: '\''PREDICTING_SHOTS'\''/' src/modules/agent/agent.service.ts
sed -i '' 's/status: '\''generating'\''/status: '\''GENERATING'\''/' src/modules/agent/agent.service.ts
sed -i '' 's/status: '\''completed'\''/status: '\''COMPLETED'\''/' src/modules/agent/agent.service.ts
sed -i '' 's/status: '\''failed'\''/status: '\''FAILED'\''/' src/modules/agent/agent.service.ts
```

### 2. 修复Generation模块枚举错误
```bash
sed -i '' 's/type: '\''image'\''/type: '\''IMAGE'\''/' src/modules/generation/generation.service.ts
sed -i '' 's/status: '\''pending'\''/status: '\''PENDING'\''/' src/modules/generation/generation.service.ts
sed -i '' 's/status: '\''processing'\''/status: '\''PROCESSING'\''/' src/modules/generation/generation.service.ts
sed -i '' 's/status: '\''completed'\''/status: '\''COMPLETED'\''/' src/modules/generation/generation.service.ts
sed -i '' 's/status: '\''failed'\''/status: '\''FAILED'\''/' src/modules/generation/generation.service.ts
sed -i '' 's/task.status !== '\''completed'\''/task.status !== '\''COMPLETED'\''/' src/modules/generation/generation.service.ts
```

### 3. 修复Model模块字段错误
```bash
# 将type改为modelType
sed -i '' 's/type: data.type,/modelType: data.type,/' src/modules/model/model.service.ts
```

### 4. 修复Auth模块错误
```bash
# 修复CreditType枚举错误
sed -i '' 's/type: '\''bonus'\''/type: '\''BONUS'\''/' src/modules/auth/auth.service.ts
```

### 5. 修复Credits模块错误
```bash
# 暂时注释掉tapies相关代码，因为User模型中不存在该字段
# 后续需要在schema中添加tapies字段
```

### 6. 修复Canvas模块错误
```bash
# 添加tenantId字段到Canvas创建逻辑
```

### 7. 修复其他模块错误
```bash
# 修复SkillCategory和SkillType枚举错误
# 修复SmsCode缺少tenantId的问题
# 修复User查询缺少tenantId的问题
```

## 立即可以开始的修复

先从最明显的枚举值错误开始修复，这些可以快速解决。