# 数据库权限配置

本项目的所有数据库读写均通过云函数（管理端）完成，小程序客户端不直接读写数据库。
因此各集合应设置为「仅云函数可读写」，即安全规则中 read 与 write 均为 false。

在微信开发者工具 → 云开发控制台 → 数据库 → 对应集合 → 权限设置 中配置。

## users

```json
{ "read": false, "write": false }
```

## groups

```json
{ "read": false, "write": false }
```

说明：云函数使用管理端权限，不受安全规则限制；客户端只能通过云函数间接访问数据。
后续阶段新增的 tasks、submissions 等集合沿用相同规则。
## tasks

`json
{ "read": false, "write": false }
``n