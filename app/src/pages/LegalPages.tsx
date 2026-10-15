import React from 'react';
import { Link } from 'react-router-dom';
import { useShopInfo } from '../hooks/useShopInfo';

// ============================================================================
// Trang pháp lý (Điều khoản, Bảo mật, Đổi trả, Liên hệ).
//
// Nội dung là mẫu tham khảo — thông tin shop lấy từ GET /api/shop (SHOP_* env).
// Trước khi go-live, thay placeholder (MST/địa chỉ/hotline) bằng dữ liệu thật.
// ============================================================================

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  updatedAt: string;
  children: React.ReactNode;
}

const LegalLayout: React.FC<LegalLayoutProps> = ({ title, subtitle, updatedAt, children }) => {
  const shop = useShopInfo();

  return (
    <main className="flex-1 w-full animate-fadeIn bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10 md:py-14">
        <p className="font-label-caps text-xs uppercase tracking-widest text-blue-600 font-bold mb-2">
          {shop.name} • PHÁP LÝ
        </p>
        <h1 className="font-display font-bold text-3xl md:text-4xl text-slate-900 mb-2">{title}</h1>
        <p className="font-body text-sm text-slate-500 mb-6">{subtitle}</p>
        <p className="text-xs text-slate-400 mb-8">Cập nhật lần cuối: {updatedAt}</p>

        <article className="space-y-6 text-sm leading-relaxed text-slate-700 font-body">{children}</article>

        <div className="mt-10 pt-6 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">
            {shop.name} — MST: {shop.taxCode}
          </p>
          <p>{shop.address}</p>
          <p>
            Hotline: {shop.phone} • Email: {shop.email}
          </p>
        </div>

        <div className="mt-8">
          <Link to="/" className="text-blue-600 hover:text-blue-800 font-semibold text-sm">
            ← Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
};

const Section: React.FC<{ heading: string; children: React.ReactNode }> = ({ heading, children }) => (
  <section className="space-y-2">
    <h2 className="font-display font-bold text-lg text-slate-900">{heading}</h2>
    {children}
  </section>
);

const UPDATED_AT = '16/10/2026';

export const TermsPage: React.FC = () => (
  <LegalLayout
    title="Điều khoản sử dụng"
    subtitle="Các quy định khi truy cập và mua sách tại website của chúng tôi."
    updatedAt={UPDATED_AT}
  >
    <Section heading="1. Chấp nhận điều khoản">
      <p>
        Khi truy cập và sử dụng website, bạn đồng ý tuân thủ các điều khoản này. Nếu không đồng ý, vui lòng
        ngừng sử dụng dịch vụ.
      </p>
    </Section>
    <Section heading="2. Tài khoản &amp; bảo mật">
      <p>
        Bạn có trách nhiệm bảo mật thông tin đăng nhập và mọi hoạt động phát sinh từ tài khoản của mình.
        Vui lòng thông báo ngay cho chúng tôi nếu phát hiện truy cập trái phép.
      </p>
    </Section>
    <Section heading="3. Giá &amp; đặt hàng">
      <p>
        Giá hiển thị là giá tham khảo và có thể thay đổi. Đơn hàng chỉ được xác nhận sau khi hệ thống tiếp
        nhận thành công. Chúng tôi có quyền từ chối/huỷ đơn trong trường hợp sai giá hoặc hết hàng.
      </p>
    </Section>
    <Section heading="4. Sở hữu trí tuệ">
      <p>
        Toàn bộ nội dung, hình ảnh, thương hiệu trên website thuộc quyền sở hữu của chúng tôi hoặc bên cấp
        phép. Nghiêm cấm sao chép, sử dụng cho mục đích thương mại khi chưa được phép.
      </p>
    </Section>
    <Section heading="5. Giải quyết tranh chấp">
      <p>
        Mọi tranh chấp được ưu tiên giải quyết thông qua thương lượng. Trường hợp không đạt được thoả thuận,
        tranh chấp sẽ được đưa ra cơ quan có thẩm quyền tại Việt Nam theo quy định pháp luật.
      </p>
    </Section>
  </LegalLayout>
);

export const PrivacyPage: React.FC = () => (
  <LegalLayout
    title="Chính sách bảo mật"
    subtitle="Cách chúng tôi thu thập, sử dụng và bảo vệ thông tin cá nhân của bạn."
    updatedAt={UPDATED_AT}
  >
    <Section heading="1. Thông tin chúng tôi thu thập">
      <p>
        Họ tên, email, số điện thoại, địa chỉ giao hàng và lịch sử đơn hàng — phục vụ việc xử lý đơn và hỗ
        trợ khách hàng.
      </p>
    </Section>
    <Section heading="2. Mục đích sử dụng">
      <p>
        Xác nhận và giao đơn hàng, hỗ trợ khách hàng, gửi thông báo giao dịch (đặt hàng, thanh toán, vận
        chuyển) và nâng cao chất lượng dịch vụ.
      </p>
    </Section>
    <Section heading="3. Bảo vệ dữ liệu">
      <p>
        Mật khẩu được lưu ở dạng băm (không lưu văn bản gốc). Thông tin nhạy cảm được mã hoá khi lưu trữ.
        Chúng tôi giới hạn quyền truy cập dữ liệu trong nội bộ.
      </p>
    </Section>
    <Section heading="4. Chia sẻ với bên thứ ba">
      <p>
        Chúng tôi chỉ chia sẻ dữ liệu cần thiết cho đối tác vận chuyển và cổng thanh toán nhằm hoàn tất đơn
        hàng. Không bán dữ liệu cá nhân của bạn.
      </p>
    </Section>
    <Section heading="5. Quyền của bạn">
      <p>
        Bạn có quyền yêu cầu truy cập, chỉnh sửa hoặc xoá dữ liệu cá nhân bằng cách liên hệ với chúng tôi
        theo thông tin ở cuối trang.
      </p>
    </Section>
  </LegalLayout>
);

export const ReturnsPage: React.FC = () => (
  <LegalLayout
    title="Chính sách đổi trả & hoàn tiền"
    subtitle="Điều kiện và quy trình đổi/trả sách, hoàn tiền cho khách hàng."
    updatedAt={UPDATED_AT}
  >
    <Section heading="1. Thời hạn đổi/trả">
      <p>
        Trong vòng <strong>07 ngày</strong> kể từ khi nhận hàng, bạn có thể yêu cầu đổi/trả nếu sách lỗi in
        ấn, hư hỏng do vận chuyển hoặc giao sai sản phẩm.
      </p>
    </Section>
    <Section heading="2. Điều kiện chấp nhận">
      <p>
        Sách còn nguyên vẹn, chưa qua sử dụng, còn đủ phụ kiện (nếu có) và có hoá đơn/mã đơn hàng để đối
        chiếu.
      </p>
    </Section>
    <Section heading="3. Quy trình">
      <p>
        Liên hệ hotline/email để tạo yêu cầu → chúng tôi xác nhận → bạn gửi sản phẩm về → kiểm tra và đổi
        hoặc hoàn tiền.
      </p>
    </Section>
    <Section heading="4. Hoàn tiền">
      <p>
        Thời gian hoàn tiền tối đa <strong>07 ngày làm việc</strong> kể từ khi yêu cầu được chấp thuận, qua
        phương thức thanh toán tương ứng của đơn hàng.
      </p>
    </Section>
    <Section heading="5. Chi phí">
      <p>
        Nếu lỗi thuộc về shop, chúng tôi chịu chi phí vận chuyển đổi/trả. Trường hợp khác, khách hàng chi
        trả chi phí vận chuyển theo quy định.
      </p>
    </Section>
  </LegalLayout>
);

export const ContactPage: React.FC = () => {
  const shop = useShopInfo();

  return (
    <LegalLayout
      title="Liên hệ"
      subtitle="Chúng tôi luôn sẵn sàng hỗ trợ bạn trong quá trình mua sắm."
      updatedAt={UPDATED_AT}
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
            Hotline
          </p>
          <p className="font-semibold text-slate-900">{shop.phone}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
            Email hỗ trợ
          </p>
          <p className="font-semibold text-slate-900 break-all">{shop.email}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
            Địa chỉ
          </p>
          <p className="font-semibold text-slate-900">{shop.address}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="font-label-caps text-xs uppercase tracking-widest text-slate-400 font-bold mb-1">
            Website
          </p>
          <p className="font-semibold text-slate-900 break-all">{shop.website}</p>
        </div>
      </div>

      <Section heading="Giờ làm việc">
        <p>Thứ 2 – Thứ 7: 08:00 – 18:00. Chủ nhật &amp; ngày lễ: nghỉ.</p>
      </Section>
      <Section heading="Khiếu nại, hỗ trợ">
        <p>
          Vui lòng cung cấp mã đơn hàng cùng mô tả vấn đề để chúng tôi hỗ trợ nhanh nhất. Phản hồi trong vòng
          24 giờ làm việc.
        </p>
      </Section>
    </LegalLayout>
  );
};
