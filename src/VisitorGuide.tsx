import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Leaf,
  MapPin,
  ShoppingBag,
  Store,
} from "lucide-react";
import { PageLink, type Page } from "./navigation";
import { officialMarketUrl } from "./marketReference";

const steps = [
  {
    icon: Leaf,
    title: "挑一份当季新鲜",
    text: "按分类挑选蔬菜，查看价格、单位与可预购库存，加入购物袋。",
  },
  {
    icon: ShoppingBag,
    title: "选好时段，提交预购",
    text: "登录顾客账号，确认自提时段与备注。提交后，在「我的预购」查看商户确认状态。",
  },
  {
    icon: Store,
    title: "到场见面，付款自提",
    text: "商户确认后按订单约定自提，到场付款。称重商品的最终金额请与商户确认。",
  },
];

export function PreorderSteps({
  navigate,
  showMore = true,
}: {
  navigate: (page: Page) => void;
  showMore?: boolean;
}) {
  return (
    <section className="preorder-guide" aria-labelledby="preorder-guide-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FROM YOUR SCREEN TO YOUR TABLE</span>
          <h2 id="preorder-guide-title">三步，把新鲜带回家。</h2>
        </div>
        {showMore && (
          <PageLink page="about" navigate={navigate} className="text-button">
            第一次来？
            <ArrowRight size={16} />
          </PageLink>
        )}
      </div>
      <div className="preorder-steps">
        {steps.map((step, index) => (
          <article key={step.title}>
            <div className="step-top">
              <span className="step-icon">
                <step.icon size={23} />
              </span>
              <span className="step-number">0{index + 1}</span>
            </div>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AboutMarket({
  navigate,
  demo,
}: {
  navigate: (page: Page) => void;
  demo: boolean;
}) {
  return (
    <div className="about-market">
      <section className="about-intro">
        <div>
          <span className="eyebrow">GOOD FOOD. GOOD NEIGHBORS.</span>
          <h2>
            一份好食物，
            <br />
            也是一次好相遇<span>。</span>
          </h2>
          <p>
            青禾把蔬菜浏览、预购和市场信息放在一起。少一点来回寻找，多一点与社区、与食物的连接。
          </p>
          <PageLink
            page="discover"
            navigate={navigate}
            className="button primary"
          >
            逛逛今日市集
            <ArrowRight size={17} />
          </PageLink>
        </div>
        <div className="about-note">
          <Leaf size={36} />
          <h3>
            让每一份新鲜，
            <br />
            都有清楚的来处。
          </h3>
          <p>看清计价单位与库存，确认自提安排，再安心出发。</p>
          <span>LOCAL FOOD. LOCAL GOOD.</span>
        </div>
      </section>
      <PreorderSteps navigate={navigate} showMore={false} />
      <div className="visitor-details">
        <section className="visitor-faq" aria-labelledby="visitor-faq-title">
          <span className="eyebrow">A FEW THINGS TO KNOW</span>
          <h2 id="visitor-faq-title">来之前，你可能想知道</h2>
          {[
            [
              "需要先注册才能浏览吗？",
              "不需要。可以直接浏览商品、市场信息和历史采价资料；提交预购及查看个人订单时需要登录顾客账号。",
            ],
            [
              "预购需要在线付款吗？",
              "目前采用到场付款，没有线上支付。订单中的金额是预估金额，称重商品的最终数量与金额需到场和商户确认。",
            ],
            [
              "提交预购后，怎样知道能否取货？",
              "到「我的预购」查看状态。待商户确认表示商户尚未接受预购；待到场自提表示商户已确认。请按订单约定的日期与时段自提。",
            ],
            [
              "临时有事，可以取消预购吗？",
              "顾客可以在「我的预购」取消待商户确认的订单，预留库存会自动归还。商户已确认的订单，顾客端不能自行取消。",
            ],
            [
              "价格观察里的价格能用于下单吗？",
              "历史采价档案属于研究资料，不是实时报价；演示价格趋势与预测也不是价格保证。预购使用商品页面及提交时服务端确认的价格。",
            ],
            [
              "这是 Rutgers 官方网站吗？",
              "青禾是社区农夫市集项目，并非 Rutgers 官方网站。实际市场的开放日期、营业时间与政策，请以 Rutgers 官方页面为准。",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </section>
        <aside className="visit-checklist">
          <span className="visit-icon">
            <MapPin size={25} />
          </span>
          <h3>出发前，再确认一下。</h3>
          <ul>
            <li>
              <CheckCircle2 size={17} />
              <span>查看官方开放日期与营业时间</span>
            </li>
            <li>
              <CheckCircle2 size={17} />
              <span>确认订单状态及约定自提时段</span>
            </li>
            <li>
              <CheckCircle2 size={17} />
              <span>带上购物袋，到场付款取货</span>
            </li>
          </ul>
          <a
            className="button secondary"
            href={officialMarketUrl}
            target="_blank"
            rel="noreferrer"
          >
            Rutgers 官方市场信息
            <ExternalLink size={15} />
          </a>
          {demo && (
            <p className="helper-text">
              当前为演示网站，示例地址和自提时段不能作为实际出行安排。
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
