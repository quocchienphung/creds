/**
 * The collateral vocabulary: what bank collateral and property descriptions are written with, as accented Vietnamese concepts. It is the knowledge base of
 * the domain recovery (lexicon.ts builds its indexes from it). It is NOT a table of `? -> answer`: a damaged word is only ever resolved to a syllable of these
 * phrases by matching its visible letters, in the context of the phrase it stands in.
 *
 * Provenance: each section names its source. Sections were DRAFTED from the vocabulary of the cited instruments and from common collateral-description
 * practice; the cited texts were NOT fetched or re-read while drafting (`verified: false`). Verify articles and effective dates before relying on a citation.
 * A taxonomy helps language understanding only: it never says that an asset is eligible as security or that anyone owns anything.
 */
export type TextDomain =
  | "land_use_right" | "house_and_building" | "land_attached_asset" | "future_asset" | "vehicle_and_transport" | "machinery_equipment"
  | "inventory_and_goods" | "deposit_and_valuable_papers" | "property_rights_and_receivables" | "ownership_and_security_status"
  | "geographic_address" | "general_collateral_description" | "unknown";

export interface SourceRef { id: string; title: string; kind: "statute" | "decree" | "practice"; license: string; verified: boolean; note: string }
export const SOURCES: Record<string, SourceRef> = {
  BLDS2015: { id: "BLDS2015", title: "Bộ luật Dân sự 2015 (91/2015/QH13), Điều 105, 107, 115", kind: "statute", license: "public legal text", verified: false, note: "asset categories, property rights" },
  ND21: { id: "ND21", title: "Nghị định 21/2021/NĐ-CP về bảo đảm thực hiện nghĩa vụ", kind: "decree", license: "public legal text", verified: false, note: "security-interest vocabulary" },
  LDD2024: { id: "LDD2024", title: "Luật Đất đai 2024 (31/2024/QH15)", kind: "statute", license: "public legal text", verified: false, note: "land-use and land-attached property vocabulary" },
  LNO2023: { id: "LNO2023", title: "Luật Nhà ở 2023 (27/2023/QH15)", kind: "statute", license: "public legal text", verified: false, note: "housing, apartment, future housing vocabulary" },
  PRACTICE: { id: "PRACTICE", title: "Common collateral-description wording (author-drafted)", kind: "practice", license: "original work, MIT with the repository", verified: false, note: "vehicles, machinery, inventory, deposits, documents, connectives" },
};
export const ONTOLOGY_VERSION = "collateral-ontology-1";

export interface Concept { id: string; domain: TextDomain; /** Accented, lower case. */ canonical: string; source: string; /** How many times the phrase counts in the language model (function words are far more frequent in running text than in a phrase list). */ weight?: number }

/**
 * Values of ONE legal attribute. Changing one of them to another changes what the text asserts (use vs ownership, registered vs not, pledge vs mortgage,
 * existing vs future, who holds what), so a damaged word whose letters could be a value of such an attribute is a HIGH-impact word: it is not accepted by
 * language likelihood alone. The protected syllables are the ones that tell the values apart (the syllables every value shares are left out).
 */
export const SLOT_VALUES: Record<string, string[]> = {
  right: ["sử dụng", "sở hữu"],
  registration: ["đã đăng ký", "chưa đăng ký"],
  polarity: ["có", "không", "chưa", "đã", "được"],
  relation: ["thế chấp", "cầm cố", "bảo lãnh", "chuyển nhượng", "cho thuê", "cho mượn", "tặng cho", "góp vốn", "giữ hộ", "đặt cọc"],
  temporal: ["hiện có", "hiện hữu", "hình thành trong tương lai", "đang xây dựng", "đã hoàn thành"],
  role: ["chủ sở hữu", "người sử dụng", "bên thế chấp", "bên nhận thế chấp", "bên bảo đảm", "bên nhận bảo đảm", "bên cầm cố", "bên nhận cầm cố", "đồng sở hữu"],
  ownership: ["sở hữu chung", "sở hữu riêng"],
  document: ["giấy chứng nhận", "giấy tờ có giá", "sổ tiết kiệm", "chứng chỉ tiền gửi", "trái phiếu", "cổ phiếu", "hợp đồng"],
};

const D = (source: string, domain: TextDomain, body: string) => ({ source, domain, body });
// Each line lists phrases separated by `;`. Every phrase is a concept of its own (spellings, longer and shorter forms, synonyms); the ASCII alias is derived.
const SECTIONS = [
  D("LDD2024", "land_use_right", `
quyền sử dụng đất ; quyền sử dụng đất ở ; quyền sử dụng đất nông nghiệp ; quyền sử dụng đất phi nông nghiệp
quyền sử dụng đất ở tại nông thôn ; quyền sử dụng đất ở tại đô thị ; quyền sử dụng đất trồng cây lâu năm ; quyền sử dụng đất trồng cây hàng năm
quyền sử dụng đất trồng lúa ; quyền sử dụng đất rừng sản xuất ; quyền sử dụng đất nuôi trồng thủy sản ; quyền sử dụng đất thương mại dịch vụ
quyền sử dụng đất sản xuất kinh doanh ; quyền sử dụng đất cơ sở sản xuất phi nông nghiệp ; quyền thuê đất ; quyền sử dụng đất thuê
đất ở ; đất ở tại đô thị ; đất ở tại nông thôn ; đất nông nghiệp ; đất phi nông nghiệp ; đất trồng cây lâu năm ; đất trồng cây hàng năm
đất trồng lúa ; đất rừng sản xuất ; đất nuôi trồng thủy sản ; đất thương mại dịch vụ ; đất sản xuất kinh doanh ; đất khu công nghiệp
thửa đất ; thửa đất số ; tờ bản đồ số ; tờ bản đồ ; diện tích đất ; diện tích sử dụng ; diện tích xây dựng ; diện tích sàn ; diện tích thửa đất
mục đích sử dụng đất ; mục đích sử dụng ; thời hạn sử dụng đất ; thời hạn sử dụng ; sử dụng lâu dài ; sử dụng riêng ; sử dụng chung
hình thức sử dụng đất ; nguồn gốc sử dụng đất ; nhà nước giao đất có thu tiền sử dụng đất ; nhà nước cho thuê đất trả tiền hàng năm
nhà nước công nhận quyền sử dụng đất ; công nhận quyền sử dụng đất ; giao đất có thu tiền sử dụng đất ; cho thuê đất trả tiền một lần
người sử dụng đất ; hộ gia đình sử dụng đất ; cá nhân sử dụng đất ; tổ chức sử dụng đất ; thông tin thửa đất ; địa chỉ thửa đất
ranh giới thửa đất ; hạn chế sử dụng đất ; chuyển mục đích sử dụng đất ; quy hoạch sử dụng đất ; tiền sử dụng đất
`),
  D("LDD2024", "land_attached_asset", `
tài sản gắn liền với đất ; tài sản khác gắn liền với đất ; tài sản gắn liền với đất không phải là nhà ở
quyền sở hữu nhà ở ; quyền sở hữu nhà ở và tài sản khác gắn liền với đất ; quyền sở hữu công trình xây dựng ; quyền sở hữu nhà ở gắn liền với đất
công trình xây dựng ; công trình xây dựng gắn liền với đất ; công trình xây dựng trên đất ; vật kiến trúc ; công trình phụ ; công trình phụ trợ
nhà xưởng ; nhà xưởng sản xuất ; nhà kho ; kho bãi ; nhà kho chứa hàng ; nhà văn phòng ; trụ sở làm việc ; cửa hàng ; nhà hàng ; khách sạn
cây lâu năm ; cây hàng năm ; cây trồng lâu năm ; rừng trồng ; vườn cây ; vườn cây lâu năm ; cây cao su ; cây cà phê ; cây hồ tiêu ; cây ăn quả
hàng rào ; sân bãi ; bể chứa ; hệ thống điện ; hệ thống cấp thoát nước ; hạ tầng kỹ thuật ; nhà lưới ; nhà màng ; chuồng trại ; trang trại
tài sản trên đất ; tài sản gắn liền ; tài sản trên đất thuê ; công trình hạ tầng ; cầu cảng ; bến bãi ; ao nuôi ; hồ nuôi
`),
  D("LNO2023", "house_and_building", `
nhà ở ; nhà ở riêng lẻ ; nhà riêng lẻ ; nhà ở thương mại ; nhà ở xã hội ; nhà ở liền kề ; nhà phố ; nhà biệt thự ; biệt thự ; nhà mặt tiền ; nhà trong hẻm
căn hộ ; căn hộ chung cư ; chung cư ; nhà chung cư ; căn hộ condotel ; căn hộ dịch vụ ; căn hộ thương mại ; căn hộ số ; phòng số ; căn số
dự án ; dự án nhà ở ; dự án khu đô thị ; khu đô thị ; khu dân cư ; khu căn hộ ; khu nhà ở ; tòa nhà ; tòa tháp ; block ; tầng ; tầng hầm ; tầng trệt ; tầng lửng
nhà một tầng ; nhà hai tầng ; nhà ba tầng ; nhà cấp bốn ; nhà gác lửng ; nhà tầng ; mặt bằng ; mặt bằng thương mại ; văn phòng ; văn phòng cho thuê
diện tích căn hộ ; diện tích sàn xây dựng ; diện tích xây dựng ; diện tích sử dụng riêng ; diện tích sử dụng chung ; tổng diện tích sàn
chủ đầu tư ; chủ đầu tư dự án ; hợp đồng mua bán căn hộ ; hợp đồng mua bán nhà ở ; hợp đồng thuê mua nhà ở ; phần diện tích sở hữu chung
thời hạn sở hữu nhà ở ; sở hữu lâu dài ; nhà ở hiện có ; nhà ở đã hoàn thành ; nhà ở đang xây dựng ; nhà ở đã xây dựng xong
`),
  D("LNO2023", "future_asset", `
tài sản hình thành trong tương lai ; tài sản hình thành từ vốn vay ; tài sản được hình thành từ vốn vay
nhà ở hình thành trong tương lai ; căn hộ hình thành trong tương lai ; công trình hình thành trong tương lai ; dự án hình thành trong tương lai
nhà ở đang xây dựng ; công trình đang xây dựng ; dự án đang triển khai ; đang trong quá trình xây dựng ; chưa hoàn thành xây dựng ; chưa hoàn thiện ; chưa bàn giao
hợp đồng mua bán nhà ở hình thành trong tương lai ; quyền tài sản phát sinh từ hợp đồng mua bán nhà ở hình thành trong tương lai ; quyền nhận bàn giao nhà ở
quyền nhận bàn giao căn hộ ; dự kiến bàn giao ; tiến độ xây dựng ; tiến độ thanh toán ; giấy phép xây dựng ; giấy phép xây dựng số ; hoàn công
`),
  D("PRACTICE", "vehicle_and_transport", `
xe ô tô ; xe ô tô con ; xe ô tô tải ; xe ô tô khách ; xe ô tô chở người ; xe ô tô đầu kéo ; ô tô ; ô tô tải ; ô tô con ; ô tô khách ; ô tô chuyên dùng
xe tải ; xe tải nhẹ ; xe tải nặng ; xe tải thùng ; xe tải ben ; xe ben ; xe đầu kéo ; xe đầu kéo container ; xe sơ mi rơ moóc ; sơ mi rơ moóc ; rơ moóc
xe chuyên dùng ; xe cứu thương ; xe cẩu ; xe bồn ; xe bồn chở xăng dầu ; xe bê tông ; xe trộn bê tông ; xe nâng ; xe khách ; xe buýt ; xe bán tải
xe mô tô ; xe máy ; xe gắn máy ; xe mô tô hai bánh ; xe tay ga ; xe điện ; xe điện bốn bánh ; xe con ; xe du lịch ; xe công nông
tàu ; tàu thủy ; tàu biển ; tàu cá ; tàu chở hàng ; tàu kéo ; tàu hút bùn ; sà lan ; xà lan ; thuyền ; ghe ; ca nô ; phương tiện thủy nội địa ; phương tiện vận tải
phương tiện ; phương tiện giao thông ; phương tiện giao thông đường bộ ; phương tiện thi công ; phương tiện vận chuyển ; đội xe ; đội tàu ; máy bay ; trực thăng
biển số xe ; biển kiểm soát ; biển số đăng ký ; số khung ; số máy ; số loại ; nhãn hiệu ; năm sản xuất ; màu sơn ; số chỗ ngồi ; tải trọng ; dung tích xi lanh ; số km đã đi
giấy đăng ký xe ; giấy chứng nhận đăng ký xe ; giấy đăng ký phương tiện ; giấy chứng nhận đăng ký phương tiện ; cà vẹt xe ; đăng kiểm ; giấy chứng nhận kiểm định
đăng ký xe ; đăng ký phương tiện ; chủ phương tiện ; chủ xe ; bảo hiểm xe ; bảo hiểm phương tiện ; hóa đơn mua xe ; hợp đồng mua bán xe ; hợp đồng mua bán phương tiện
`),
  D("PRACTICE", "machinery_equipment", `
máy móc ; máy móc thiết bị ; máy móc và thiết bị ; thiết bị ; thiết bị sản xuất ; thiết bị văn phòng ; thiết bị y tế ; thiết bị điện ; thiết bị công nghệ ; thiết bị chuyên dùng
dây chuyền ; dây chuyền sản xuất ; dây chuyền công nghệ ; dây chuyền thiết bị ; dây chuyền máy móc ; dây chuyền chế biến ; dây chuyền đóng gói
máy xây dựng ; máy thi công ; máy xúc ; máy xúc đào ; máy đào ; máy ủi ; máy san ; máy lu ; máy cẩu ; cần cẩu ; cần trục ; cần trục tháp ; máy trộn bê tông ; máy bơm bê tông
bơm bê tông ; bơm bê tông cần ; bơm bê tông tĩnh ; xe bơm bê tông ; máy khoan ; máy khoan cọc nhồi ; máy ép cọc ; máy nén khí ; máy phát điện ; máy biến áp ; máy bơm ; máy bơm nước
máy sản xuất ; máy công cụ ; máy tiện ; máy phay ; máy cắt ; máy hàn ; máy dập ; máy ép ; máy ép nhựa ; máy đóng gói ; máy in ; máy may ; máy dệt ; máy nghiền ; máy sấy ; máy lạnh
hệ thống máy móc ; hệ thống thiết bị ; hệ thống lạnh ; hệ thống xử lý nước thải ; hệ thống điện mặt trời ; tấm pin năng lượng mặt trời ; tuabin ; lò hơi ; lò nung ; băng tải
động cơ ; hộp số ; bồn chứa ; thùng chứa ; giàn giáo ; cốp pha ; khuôn mẫu ; dụng cụ ; công cụ dụng cụ ; linh kiện ; phụ tùng ; phụ tùng thay thế ; máy vi tính ; máy chủ ; máy tính
số seri ; số hiệu máy ; năm sản xuất ; nước sản xuất ; xuất xứ ; công suất ; công suất thiết kế ; model ; hợp đồng mua bán máy móc ; hợp đồng mua bán thiết bị ; hóa đơn mua thiết bị
`),
  D("PRACTICE", "inventory_and_goods", `
hàng tồn kho ; hàng hóa tồn kho ; hàng hóa ; hàng hóa luân chuyển ; hàng luân chuyển ; hàng hóa trong kho ; hàng hóa tại kho ; hàng hóa tồn kho luân chuyển
nguyên vật liệu ; nguyên liệu ; vật liệu ; vật tư ; vật tư thiết bị ; thành phẩm ; bán thành phẩm ; sản phẩm dở dang ; chi phí sản xuất kinh doanh dở dang ; phế liệu
kho hàng ; kho bãi ; kho lạnh ; kho ngoại quan ; kho nguyên liệu ; kho thành phẩm ; kho chứa hàng ; nhà kho ; bãi chứa hàng ; bãi tập kết
khối lượng ; sản lượng ; số lượng ; số lượng hàng hóa ; trọng lượng ; đơn giá ; thành tiền ; giá trị hàng tồn kho ; đơn vị tính ; quy cách ; chất lượng ; chủng loại ; xuất xứ hàng hóa
lúa gạo ; gạo ; cà phê ; cà phê nhân ; hạt điều ; hồ tiêu ; cao su ; mủ cao su ; thủy sản ; tôm ; cá tra ; cá basa ; trái cây ; thức ăn chăn nuôi ; phân bón ; thuốc trừ sâu ; xi măng ; sắt thép ; thép xây dựng ; gỗ ; ván ép
xăng dầu ; khí đốt ; than đá ; hóa chất ; dược phẩm ; thuốc ; vật tư y tế ; hàng may mặc ; vải ; quần áo ; giày dép ; hàng điện tử ; hàng điện máy ; hàng tiêu dùng ; thực phẩm ; đồ uống ; bia ; nước giải khát
biên bản kiểm kê ; biên bản kiểm kê hàng hóa ; phiếu nhập kho ; phiếu xuất kho ; hóa đơn nhập hàng ; hóa đơn bán hàng ; báo cáo tồn kho ; bảo hiểm hàng hóa ; kiểm kê hàng hóa
`),
  D("PRACTICE", "deposit_and_valuable_papers", `
sổ tiết kiệm ; sổ tiết kiệm có kỳ hạn ; sổ tiết kiệm không kỳ hạn ; sổ tiết kiệm số ; thẻ tiết kiệm ; thẻ tiết kiệm có kỳ hạn ; tiền gửi ; tiền gửi tiết kiệm ; tiền gửi có kỳ hạn ; tiền gửi không kỳ hạn
chứng chỉ tiền gửi ; chứng chỉ tiền gửi có kỳ hạn ; hợp đồng tiền gửi ; hợp đồng tiền gửi có kỳ hạn ; tài khoản tiền gửi ; tài khoản thanh toán ; tài khoản ngân hàng ; số tài khoản ; tài khoản số
giấy tờ có giá ; trái phiếu ; trái phiếu doanh nghiệp ; trái phiếu chính phủ ; cổ phiếu ; cổ phần ; cổ phần phổ thông ; phần vốn góp ; vốn góp ; tín phiếu ; kỳ phiếu ; hối phiếu ; séc ; chứng khoán ; chứng chỉ quỹ ; hợp đồng bảo hiểm nhân thọ
lãi suất ; lãi suất tiền gửi ; kỳ hạn gửi ; ngày đáo hạn ; ngày gửi ; số dư ; số dư tiền gửi ; số tiền gửi ; số tiền ; mệnh giá ; trị giá ; giá trị ; ngân hàng ; chi nhánh ngân hàng ; phong tỏa ; phong tỏa tài khoản ; tạm khóa
giấy xác nhận số dư ; giấy xác nhận tiền gửi ; xác nhận phong tỏa ; giấy ủy quyền ; giấy cam kết ; giấy đề nghị
`),
  D("BLDS2015", "property_rights_and_receivables", `
quyền tài sản ; quyền tài sản phát sinh từ hợp đồng ; quyền phát sinh từ hợp đồng ; quyền đòi nợ ; quyền yêu cầu thanh toán ; quyền yêu cầu ; quyền thu hồi nợ ; quyền nhận tiền
khoản phải thu ; các khoản phải thu ; khoản phải thu từ hợp đồng ; khoản phải thu khách hàng ; công nợ phải thu ; khoản thu ; nguồn thu ; dòng tiền ; doanh thu ; doanh thu từ hợp đồng ; lợi tức ; lợi nhuận
quyền khai thác ; quyền khai thác tài sản ; quyền khai thác dự án ; quyền thu phí ; quyền thu phí giao thông ; quyền đối với phần vốn góp ; quyền sở hữu trí tuệ ; quyền tác giả ; quyền sở hữu công nghiệp ; nhãn hiệu hàng hóa
quyền thuê ; quyền thuê tài sản ; quyền thuê nhà ; quyền thuê mặt bằng ; quyền nhận bảo hiểm ; quyền thụ hưởng ; quyền thụ hưởng bảo hiểm ; quyền hưởng lợi ; quyền mua ; quyền mua căn hộ
hợp đồng ; hợp đồng mua bán ; hợp đồng thi công ; hợp đồng cung cấp ; hợp đồng cung ứng ; hợp đồng xây dựng ; hợp đồng thuê ; hợp đồng dịch vụ ; hợp đồng kinh tế ; hợp đồng nguyên tắc ; phụ lục hợp đồng ; hợp đồng số
bên mua ; bên bán ; bên thuê ; bên cho thuê ; bên được bảo lãnh ; bên có nghĩa vụ ; bên có quyền ; bên thứ ba ; khách hàng ; chủ đầu tư ; nhà thầu ; nhà cung cấp ; đối tác
thanh toán ; thanh toán đợt một ; thanh toán đợt hai ; tạm ứng ; nghiệm thu ; biên bản nghiệm thu ; thanh lý hợp đồng ; biên bản thanh lý ; hóa đơn giá trị gia tăng ; hóa đơn
`),
  D("ND21", "ownership_and_security_status", `
chủ sở hữu ; chủ sở hữu tài sản ; chủ sở hữu duy nhất ; chủ sử dụng ; người sử dụng đất ; người sử dụng ; người đứng tên ; bên thế chấp ; bên nhận thế chấp ; bên cầm cố ; bên nhận cầm cố
bên bảo đảm ; bên nhận bảo đảm ; bên được bảo lãnh ; bên bảo lãnh ; bên có nghĩa vụ ; bên có quyền ; người bảo lãnh ; người thứ ba ; người thế chấp ; người nhận thế chấp
đồng sở hữu ; đồng sở hữu chung ; sở hữu chung ; sở hữu riêng ; sở hữu chung hợp nhất ; sở hữu chung theo phần ; tài sản chung ; tài sản riêng ; tài sản chung vợ chồng ; tài sản riêng của vợ chồng
tài sản bảo đảm ; tài sản thế chấp ; tài sản cầm cố ; tài sản bảo lãnh ; tài sản đảm bảo ; tài sản hiện có ; tài sản đã có ; tài sản hiện hữu ; tài sản hình thành trong tương lai ; tài sản dùng để bảo đảm
thế chấp ; cầm cố ; bảo lãnh ; bảo lưu quyền sở hữu ; đặt cọc ; ký cược ; ký quỹ ; chuyển nhượng ; cho thuê ; cho mượn ; tặng cho ; góp vốn ; giữ hộ ; ủy quyền ; thừa kế
hợp đồng thế chấp ; hợp đồng thế chấp tài sản ; hợp đồng cầm cố ; hợp đồng cầm cố tài sản ; hợp đồng bảo lãnh ; hợp đồng bảo đảm ; hợp đồng đặt cọc ; hợp đồng chuyển nhượng ; hợp đồng cho thuê ; hợp đồng ủy quyền ; hợp đồng tặng cho
đã đăng ký ; đã đăng ký thế chấp ; đã đăng ký giao dịch bảo đảm ; đã đăng ký biện pháp bảo đảm
chưa đăng ký ; chưa đăng ký thế chấp ; chưa đăng ký giao dịch bảo đảm ; chưa đăng ký biện pháp bảo đảm
đăng ký thế chấp ; đăng ký giao dịch bảo đảm ; đăng ký biện pháp bảo đảm ; đăng ký thay đổi ; đăng ký xóa thế chấp ; xóa đăng ký thế chấp ; giải chấp ; giải chấp tài sản ; đăng ký quyền sở hữu ; đăng ký quyền sử dụng
đã được cấp ; chưa được cấp ; đã được cấp giấy chứng nhận ; chưa được cấp giấy chứng nhận ; được cấp giấy chứng nhận ; không được cấp ; được phép ; không được phép ; được chuyển nhượng ; không được chuyển nhượng
hiện có ; hiện hữu ; hình thành trong tương lai ; đang xây dựng ; đã hoàn thành ; đã xây dựng xong
không có tranh chấp ; có tranh chấp ; không tranh chấp ; đang tranh chấp ; không bị kê biên ; đang bị kê biên ; kê biên ; không bị phong tỏa ; đang bị phong tỏa ; không có ; có ; không ; chưa ; đã ; được ; không được ; chưa được
nghĩa vụ ; nghĩa vụ được bảo đảm ; nghĩa vụ bảo đảm ; nghĩa vụ trả nợ ; nghĩa vụ thanh toán ; khoản vay ; khoản vay ngân hàng ; khoản cấp tín dụng ; hạn mức tín dụng ; hạn mức vay ; bảo đảm tiền vay ; bảo đảm thực hiện nghĩa vụ ; biện pháp bảo đảm ; giao dịch bảo đảm
thứ tự ưu tiên thanh toán ; xử lý tài sản bảo đảm ; phát mại tài sản ; giá trị tài sản bảo đảm ; giá trị định giá ; giá trị thẩm định ; thẩm định giá ; định giá tài sản ; biên bản định giá ; chứng thư thẩm định giá ; tỷ lệ cho vay ; tỷ lệ sở hữu
`),
  D("PRACTICE", "general_collateral_description", `
giấy chứng nhận ; giấy chứng nhận quyền sử dụng đất ; giấy chứng nhận quyền sở hữu nhà ở ; giấy chứng nhận quyền sử dụng đất quyền sở hữu nhà ở và tài sản khác gắn liền với đất
giấy chứng nhận quyền sở hữu nhà ở và quyền sử dụng đất ở ; giấy chứng nhận đăng ký ; giấy chứng nhận đăng ký doanh nghiệp ; giấy chứng nhận đầu tư ; giấy chứng nhận quyền sở hữu tài sản ; sổ đỏ ; sổ hồng ; sổ đỏ sổ hồng
số phát hành ; số phát hành giấy chứng nhận ; số vào sổ ; số vào sổ cấp giấy chứng nhận ; số vào sổ cấp giấy chứng nhận quyền sử dụng đất ; số giấy chứng nhận ; số hồ sơ ; số hợp đồng ; số công chứng ; số biên bản ; số quyết định
ngày cấp ; nơi cấp ; cơ quan cấp ; cấp ngày ; cấp bởi ; do ; do sở tài nguyên và môi trường cấp ; sở tài nguyên và môi trường ; ủy ban nhân dân ; ủy ban nhân dân quận ; ủy ban nhân dân huyện ; ủy ban nhân dân tỉnh ; văn phòng đăng ký đất đai ; chi nhánh văn phòng đăng ký đất đai ; phòng công chứng ; văn phòng công chứng ; công chứng ; công chứng viên
hợp đồng mua bán ; hợp đồng thế chấp ; hóa đơn ; biên bản ; biên bản bàn giao ; biên bản họp ; biên bản định giá ; phụ lục ; phụ lục hợp đồng ; quyết định ; tờ khai ; đơn đề nghị ; giấy tờ pháp lý ; hồ sơ pháp lý ; hồ sơ tài sản ; chứng từ ; bản sao ; bản chính ; bản sao y
mô tả tài sản ; mô tả tài sản bảo đảm ; thông tin tài sản ; thông tin tài sản bảo đảm ; tên tài sản ; loại tài sản ; đặc điểm tài sản ; tình trạng tài sản ; tình trạng pháp lý ; tình trạng pháp lý của tài sản ; tình trạng sử dụng ; hiện trạng ; hiện trạng sử dụng ; ghi chú ; ghi chú khác
~ của ; và ; với ; tại ; thuộc ; theo ; do ; cho ; để ; từ ; trên ; trong ; là ; hoặc ; bởi ; này ; đó ; các ; những ; một ; hai ; ba ; không ; có ; đã ; được ; số ; ngày ; tháng ; năm
gồm ; bao gồm ; như sau ; kèm theo ; đính kèm ; tổng ; tổng cộng ; mỗi ; ông ; bà ; công ty ; công ty cổ phần ; công ty trách nhiệm hữu hạn ; công ty tnhh ; doanh nghiệp ; doanh nghiệp tư nhân ; hộ kinh doanh ; hợp tác xã ; cá nhân ; hộ gia đình ; vợ chồng ; ông bà
số # ; ngày # ; tháng # ; năm # ; tầng # ; số nhà # ; hợp đồng số # ; giấy chứng nhận số # ; thửa đất số # ; tờ bản đồ số # ; biển số # ; biển số xe # ; số khung # ; số máy # ; số hợp đồng # ; số giấy chứng nhận # ; số phát hành # ; số vào sổ # ; số lượng # ; số tiền # ; diện tích # ; khối lượng # ; trị giá # ; đơn giá # ; thành tiền # ; căn hộ số # ; phòng số # ; số tài khoản # ; số seri # ; số hồ sơ # ; số biên bản # ; số quyết định # ; số công chứng # ; năm sản xuất # ; kỳ hạn # ; lãi suất # ; mệnh giá # ; số dư # ; số km đã đi # ; tờ bản đồ # ; thửa đất # ; giấy đăng ký số # ; giấy phép xây dựng số # ; mã số # ; số thứ tự # ; số tờ # ; số thửa # ; số chỗ ngồi #
# mét vuông ; # tấn ; # đồng ; # tháng ; # năm ; # ngày ; # kg ; # ki lô gam ; # lít ; # cái ; # chiếc ; # bộ ; # tầng ; # triệu đồng ; # tỷ đồng ; # nghìn đồng
đồng ; việt nam đồng ; triệu đồng ; tỷ đồng ; nghìn đồng ; mét vuông ; mét ; ki lô gam ; kilôgam ; tấn ; lít ; cái ; chiếc ; bộ ; hệ thống ; lô ; kiện ; thùng ; bao ; năm sản xuất ; còn hiệu lực ; hết hiệu lực ; có hiệu lực ; hiệu lực ; thời hạn ; kể từ ngày ; đến ngày ; từ ngày
`),
  D("PRACTICE", "geographic_address", `
địa chỉ ; địa chỉ tài sản ; địa chỉ thửa đất ; địa chỉ kho ; địa chỉ nhà ; địa điểm ; vị trí ; vị trí tài sản ; tọa lạc tại ; tọa lạc ; địa chỉ tại ; thuộc địa chỉ ; nằm tại ; thuộc xã ; thuộc phường ; thuộc quận ; thuộc huyện
số nhà ; số nhà đường ; hẻm ; ngõ ; ngách ; khu phố ; tổ dân phố ; thôn ; ấp ; xóm ; bản ; làng ; khu vực ; khu công nghiệp ; cụm công nghiệp ; khu chế xuất ; khu kinh tế ; khu đô thị mới ; tổ ; khối ; khu phố
đường ; phố ; quốc lộ ; tỉnh lộ ; đại lộ ; xã ; phường ; thị trấn ; quận ; huyện ; thị xã ; thành phố ; thành phố trực thuộc trung ương ; tỉnh ; thủ đô ; thành phố hồ chí minh ; hà nội ; đà nẵng ; hải phòng ; cần thơ
`),
];

const slugOf = (text: string) => text.replace(/#/g, " num ").normalize("NFD").replace(/\p{M}+/gu, "").replace(/đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every concept of the ontology, parsed once. */
export function loadConcepts(): Concept[] {
  const out: Concept[] = [], seen = new Set<string>();
  for (const section of SECTIONS) for (const raw of section.body.split("\n")) {
    const line = raw.trim(); if (!line) continue;
    const frequent = line.startsWith("~"), phrases = (frequent ? line.slice(1) : line).split(";").map(item => item.normalize("NFC").trim().toLowerCase()).filter(Boolean);
    // Within a line every phrase is a spelling of its own concept; a phrase listed twice (in the same domain) is kept once.
    for (const phrase of phrases) {
      const key = section.domain + "\u0001" + phrase;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ id: `${section.domain}:${slugOf(phrase)}`, domain: section.domain, canonical: phrase, source: section.source, ...(frequent ? { weight: 25 } : {}) });
    }
  }
  return out;
}
