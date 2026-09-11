# MODIFICATIONS.md — script 目录

## 规则

- 本目录为油猴脚本仓库，每个 `.user.js` / `.js` 文件独立生效，改动仅针对单文件，无需递增目录级版本号（脚本内 `@version` 由功能变更时手动维护）。
- 新增/删除脚本后同步更新 `readme.md` 的脚本清单表。

## 修改记录

### 文档 · README 生成（2026-09-11）

- **功能**：为 script 目录生成说明文档。
- **修改内容**：扫描目录内 7 个文件，依据各脚本 UserScript 元数据块（@name/@version/@match/@description）整理出脚本清单、用处说明、使用方式与文件命名约定。
- **涉及文件与位置**：
  - `readme.md`（新建）
  - `MODIFICATIONS.md`（新建，本文件）
