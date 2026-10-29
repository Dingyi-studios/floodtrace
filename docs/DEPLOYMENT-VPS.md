# VPS 静态部署

在线演示：**https://realkk.icu/floodtrace/**，当前部署v0.4.4。这个地址由个人VPS的现有HTTPS静态站提供，Mac关机后仍可访问。演示数据已公开在项目仓库，页面没有登录限制。

## 构建与发布

根路径本地版与VPS子目录版分别构建，不互相覆盖：

```sh
npm --prefix app run build
npm --prefix app run build:vps
python3 scripts/build_vps_bundle.py
```

`app/dist/`继续用于本地5178预览；`app/dist-vps/`的Vite base为`/floodtrace/`。数据、模型二进制、安全分区和地表贴图统一经`asset-url.js`拼接前缀，JSON中的源URL与数值场保持原样。

部署包位于被Git忽略的`delivery/FloodTrace-v<版本>-vps.tar.gz`，包含静态文件、数据归属、第三方许可和逐文件SHA-256清单，不含原视频、Git、凭据或求解环境。通过已有SSH密钥连接VPS后，在服务器使用`scripts/promote_vps.py`，传入上传文件、校验值和经过确认的现有网站根目录：

```text
python3 promote_vps.py --archive <上传包> --sha256 <包的SHA-256> --webroot <现有网站根目录>
```

该脚本先验证上传包，再在网站根目录的同级`releases/floodtrace/`内新建版本目录，逐文件核验后原子切换网站根目录中的`floodtrace`符号链接。旧发布目录保留；遇到非托管的同名文件或目录会拒绝覆盖。连接参数和服务器具体路径保存在私人的“服务器”项目，不写入此仓库。

## 回退与维护

回退时仅把网站根目录的`floodtrace`链接切回保留的发布目录；部署记录保存了`previousTarget`。首次上线没有旧目录，撤下该链接即可停止演示，发布文件仍保留。不要覆盖网站首页，也不要将Git仓库或凭据同步到静态目录。

本次直接复用现有OpenResty与HTTPS，没有新增服务进程、监听端口、DNS记录或定时任务。首次加载需要下载数十MB三维与水场数据，本次公网冷加载水场约14秒，实际时间取决于网络和设备。回放和三维渲染由访问者浏览器完成。

## 2026-10-26验收

- VPS逐文件核验35项SHA-256；外网HTTPS对35个发布文件均返回200，长度与清单一致。
- 实际浏览器验证两个情景的水场、贴图和风险数据、360名群众、三集结点备注、库存倒拖、车辆移动及持续跟随，未记录控制台错误。
- 根路径与子目录路径检查通过，原有6项任务与10项集结点 / 标签检查通过，两种正式构建通过。
- 原首页及其CSS / JS与原OpenResty配置的部署前后哈希一致，原四个容器仍在运行。

精简记录：`validation/v4.2/deployment-checks.json`。完整截图、上传清单和服务器路径保留在SSD项目`validation/v4.2/`及私人的服务器项目部署记录中。

v0.4.3的雨线、侧栏滚动、小窗控件和全图外围河道显示验收，见[本轮记录](VALIDATION-V043.md)。

当前v0.4.4补充窄屏时间轴、键盘操作、对话框焦点和回放终点同步；见[本轮记录](VALIDATION-V044.md)。

## 入口与固定URL缓存

已在现有站点server块内应用[缓存规则片段](../deploy/openresty-floodtrace-cache.conf)：入口`index.html`、发布清单和`data/`固定URL通过`expires -1`生成`Cache-Control: no-cache`，每次使用前验证缓存。带内容哈希的JS/CSS继续使用独立文件名。站点目录请求会内部定位到该index规则。

这是在v0.4.4线上复查中发现并修复的旧HTML缓存问题。已缓存旧入口的浏览器进行一次普通刷新后使用新版规则。规则修改前需备份当前站点配置，先执行OpenResty配置语法检查，再平滑reload；保持原站点root和TLS设置。回退静态版本不需要撤销缓存规则。
