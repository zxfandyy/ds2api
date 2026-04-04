# 原始流数据样本目录

该目录用于存放**上游真实 SSE 原始流**样本，供本地仿真测试和解析适配使用。

## 默认永久样本

仓库当前只保留两份永久默认样本：

- `guangzhou-weather-reasoner-search-20260404`：包含 `reference:N` 引用标记的天气搜索流，用于验证引用清理与正文输出。
- `content-filter-trigger-20260405-jwt3`：真实命中的 `CONTENT_FILTER` 风控流，用于验证终态处理与拒答格式。

默认回放工具会优先读取 [`manifest.json`](./manifest.json) 中的 `default_samples`，以稳定固定回放集。

## 目录规范

每个样本一个子目录：

- `meta.json`：样本元信息（问题、模型、采集时间、备注）
- `upstream.stream.sse`：完整原始 SSE 文本（`event:` / `data:` 行）

## 扩展方式

1. 抓取一次真实请求（建议开启 `DS2API_DEV_PACKET_CAPTURE=1`）。
2. 新建 `<sample-id>/` 目录并放入 `meta.json` + `upstream.stream.sse`。
3. 运行独立仿真工具（可被其他测试脚本调用）：

```bash
./tests/scripts/run-raw-stream-sim.sh
```

该工具默认按 `manifest.json` 中声明的永久样本重放并验证：

- 不会把上游 `status=FINISHED` 片段当正文输出（防泄露）。
- 能正确检测 `response/status=FINISHED` 流结束信号。
- 生成可归档 JSON 报告（`artifacts/raw-stream-sim/`）。

如果 `manifest.json` 不存在，则回退为遍历目录中的全部样本。

> 注意：样本可能包含搜索结果正文与引用信息，请勿放入敏感账号/密钥。
