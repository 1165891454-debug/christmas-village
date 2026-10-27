/* specialties.js — v4.3 远方物产册
 *
 * 这里登记的是「你们俩真的去过的地方」以及每个地方能寄回来的一件特产。
 * 作用有三个：
 *   1. 工坊的打包台需要「地址」才能寄包裹，地址来自回忆、邮差、和特产交换；
 *   2. 回信里会附一件当地特产，收进回忆册的「远方物产」一节；
 *   3. 村民的委托会点名要某种特产，凑齐 41 种是这个游戏最长的一条线。
 *
 * 字段：id（与 memories.js 的 id / maps.js 的 id 对齐）、name 地名、region 分区、
 *       item 特产名、icon 一个字符的表情、line 一句短短的备注。
 */
window.Travels = (function () {
  'use strict';

  var LIST = [
    /* ---------------- 华北 ---------------- */
    { id: 'beijing', name: '北京', region: '华北', item: '冰糖葫芦', icon: '🍡', line: '冬天才有的一口脆，咬下去先甜后酸。' },
    { id: 'tianjin', name: '天津', region: '华北', item: '十八街麻花', icon: '🥨', line: '去了五次的地方，麻花还是一样酥。' },
    { id: 'zhuozhou', name: '河北 · 涿州', region: '华北', item: '涿州贡米', icon: '🍚', line: '两趟涿州，米是唯一带得回来的东西。' },
    { id: 'guan', name: '河北 · 固安', region: '华北', item: '柳编小篮', icon: '🧺', line: '编得密密的，装什么都不掉。' },
    { id: 'anaya', name: '河北 · 阿那亚', region: '华北', item: '海边粗盐', icon: '🧂', line: '海风把盐吹到窗上，白得像雪。' },
    { id: 'baoding', name: '河北 · 保定', region: '华北', item: '驴肉火烧', icon: '🥙', line: '热的，一定要吃热的。' },
    { id: 'cangzhou', name: '河北 · 沧州', region: '华北', item: '金丝小枣', icon: '🫒', line: '掰开能拉出丝来，甜得很实在。' },
    { id: 'chongli', name: '河北 · 崇礼', region: '华北', item: '口蘑干', icon: '🍄', line: '两次崇礼，雪都比想象中大。' },
    { id: 'datong', name: '山西 · 大同', region: '华北', item: '黄花菜', icon: '🌼', line: '晒干的一小把，泡开又是一整朵。' },
    { id: 'shuozhou', name: '山西 · 朔州', region: '华北', item: '沙棘汁', icon: '🧃', line: '酸得人眯眼，据说很补。' },
    { id: 'baotou', name: '内蒙古 · 包头', region: '华北', item: '风干牛肉', icon: '🥩', line: '越嚼越香，路上吃正好。' },
    { id: 'eerduosi', name: '内蒙古 · 鄂尔多斯', region: '华北', item: '羊绒围巾', icon: '🧣', line: '轻得像没有，暖得很实在。' },
    { id: 'wuhai', name: '内蒙古 · 乌海', region: '华北', item: '沙漠葡萄酒', icon: '🍷', line: '一半沙漠一半湖的地方，葡萄特别甜。' },
    { id: 'chifeng', name: '内蒙古 · 赤峰', region: '华北', item: '奶豆腐', icon: '🧀', line: '两趟赤峰，奶味一直记到现在。' },
    { id: 'xilingol', name: '内蒙古 · 锡林郭勒', region: '华北', item: '苏尼特肉干', icon: '🍖', line: '草原上的肉，风一吹就干。' },

    /* ---------------- 东北 ---------------- */
    { id: 'shenyang', name: '辽宁 · 沈阳', region: '东北', item: '不老林糖', icon: '🍬', line: '澡堂出来含一颗，甜到耳朵。' },
    { id: 'dalian', name: '辽宁 · 大连', region: '东北', item: '大樱桃', icon: '🍒', line: '一箱一箱地吃，吃到手指发红。' },
    { id: 'jinzhou', name: '辽宁 · 锦州', region: '东北', item: '沟帮子熏鸡', icon: '🍗', line: '一整只，车上就撕着吃了。' },
    { id: 'yingkou', name: '辽宁 · 营口鲅鱼圈', region: '东北', item: '鲅鱼干', icon: '🐟', line: '海边晾的一排，风里全是咸味。' },
    { id: 'changchun', name: '吉林 · 长春', region: '东北', item: '人参', icon: '🌿', line: '小小一支，长得像个人。' },
    { id: 'baicheng', name: '吉林 · 白城', region: '东北', item: '白城绿豆', icon: '🫘', line: '熬一锅汤，夏天就过去了。' },

    /* ---------------- 华东 ---------------- */
    { id: 'shanghai', name: '上海', region: '华东', item: '蝴蝶酥', icon: '🥐', line: '排队买的，盒子比点心还漂亮。' },
    { id: 'hangzhou', name: '浙江 · 杭州', region: '华东', item: '西湖藕粉', icon: '🥣', line: '两次杭州，两碗藕粉。' },
    { id: 'shaoxing', name: '浙江 · 绍兴', region: '华东', item: '花雕黄酒', icon: '🍶', line: '小坛子装的，要用温水烫着喝。' },
    { id: 'suzhou', name: '江苏 · 苏州', region: '华东', item: '苏绣手帕', icon: '🧵', line: '园林坐了整整一下午，帕子是那天买的。' },
    { id: 'yangzhou', name: '江苏 · 扬州', region: '华东', item: '漆器小盒', icon: '🎁', line: '装那支一直没舍得扔的牙刷正好。' },
    { id: 'zibo', name: '山东 · 淄博', region: '华东', item: '博山琉璃珠', icon: '🫧', line: '烧烤摊旁边的小店，珠子亮得像糖。' },
    { id: 'dongying', name: '山东 · 东营', region: '华东', item: '黄河口大闸蟹', icon: '🦀', line: '自驾那天看完日落，回去吃了蟹。' },
    { id: 'weihai', name: '山东 · 威海', region: '华东', item: '金钩海米', icon: '🦐', line: '小小一只，吊汤特别鲜。' },

    /* ---------------- 华中 ---------------- */
    { id: 'wuhan', name: '湖北 · 武汉', region: '华中', item: '热干面', icon: '🍜', line: '你的第二故乡，早上就要来一碗。' },
    { id: 'kaifeng', name: '河南 · 开封', region: '华中', item: '花生糕', icon: '🥜', line: '一层一层，掉渣掉得很开心。' },

    /* ---------------- 华南 ---------------- */
    { id: 'shenzhen', name: '广东 · 深圳', region: '华南', item: '沙井蚝干', icon: '🦪', line: '晒得干干的，煲汤很香。' },
    { id: 'zhuhai', name: '广东 · 珠海', region: '华南', item: '斗门黄沙蚬', icon: '🐚', line: '长隆那天走了很多路，晚上吃到这个。' },

    /* ---------------- 西南 ---------------- */
    { id: 'chongqing', name: '重庆', region: '西南', item: '火锅底料', icon: '🌶️', line: '一块能煮一整锅，辣得很讲义气。' },
    { id: 'chengdu', name: '四川 · 成都', region: '西南', item: '熊猫布偶', icon: '🐼', line: '看完滚滚，忍不住买了一只。' },
    { id: 'leshan', name: '四川 · 乐山', region: '西南', item: '甜皮鸭', icon: '🦆', line: '大佛脚下走酸的腿，靠它补回来。' },
    { id: 'ankang', name: '陕西 · 安康', region: '西南', item: '富硒茶', icon: '🍵', line: '山里的茶，泡开一片一片立着。' },
    { id: 'tibet', name: '西藏', region: '西南', item: '酥油茶砖', icon: '🧈', line: '高原上最靠得住的一口热。' },

    /* ---------------- 西北 ---------------- */
    { id: 'sayram', name: '新疆 · 赛里木湖', region: '西北', item: '薰衣草蜜', icon: '🍯', line: '登记结婚那天的湖，蜜是后来的甜。' },

    /* ---------------- 境外 ---------------- */
    { id: 'doha', name: '卡塔尔 · 多哈', region: '境外', item: '椰枣', icon: '🌴', line: '甜得发腻，配茶刚好。' },
    { id: 'kl', name: '马来西亚 · 吉隆坡', region: '境外', item: '白咖啡', icon: '☕', line: '等行李的那两天，靠它提神。' }
  ];

  var BY = {};
  LIST.forEach(function (p) { BY[p.id] = p; });
  var REGIONS = ['华北', '东北', '华东', '华中', '华南', '西南', '西北', '境外'];

  return {
    list: LIST,
    regions: REGIONS,
    count: LIST.length,
    get: function (id) { return BY[id] || null; },
    has: function (id) { return !!BY[id]; },
    /* 按分区取，顺序固定（面板与验收脚本都依赖这个顺序） */
    byRegion: function (region) {
      return LIST.filter(function (p) { return p.region === region; });
    },
    /* 名字 → id 反查（村民委托里写中文名更自然） */
    findByName: function (name) {
      for (var i = 0; i < LIST.length; i++) if (LIST[i].name === name || LIST[i].item === name) return LIST[i];
      return null;
    }
  };
})();
