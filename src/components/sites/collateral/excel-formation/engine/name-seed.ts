/**
 * Vietnamese given names and middle names written without marks, from duyet/vietnamese-namedb (MIT License, Copyright (c) 2016 Van-Duyet Le):
 * https://github.com/duyet/vietnamese-namedb, files boy_no_accents.txt, girl_no_accents.txt and the two one_word_no_accents.txt. The last word of each name is
 * a given name, the words before it are middle names. A prior for the guess of a name the file itself cannot settle: it carries NO frequency, so it ranks below
 * every word the file has written.
 */
const words = (lines: string[]) => lines.join(" ").split(" ");
export const GIVEN_NAMES = words([
  "ai an anh au ba bac bach ban bang bao bich binh boi bong buu ca cam can canh cao cat chan chanh chau che chi chien chieu chinh chuan chung chuong",
  "chuyen co cong cuc cung cuong da dac dai dan dang danh dao dat de di diem dien diep dieu dinh do doan doanh don dong du duc due dung duong duy duyen",
  "duyet gia giac giang giao giap ha hac hai ham han hang hanh hao hau hien hiep hieu ho hoa hoai hoan hoang hoat hoc hoi hong hop huan hue hung huong",
  "huu huy huyen huynh hy ke kha khac khai khang khanh khe khiem khiet khieu khoa khoan khoat khoi khuc khue khuong khuyen kiem kien kiet kieu kim kinh",
  "ky lac lai lam lan lang lap le liem lien liet lieu linh lo loan loc loi long luan luat luc luong luu ly mai man manh mau mi mien minh moc mong my nam",
  "nang nga ngan nghi nghia nghiem nghiep ngoc ngon nguyen nguyet nha nhan nhat nhi nhiem nhien nhon nhu nhuan nhung nhuong niem ninh nu nuong oanh phap",
  "phat phi phong phu phuc phung phuoc phuong quan quang que quoc quy quyen quyet quynh sa sam san sang sao si sieu sinh son song su suong sy ta tai tam",
  "tan tat thac thach thai tham thang thanh thao that the theu thi thien thieu thinh tho thoa thoai thoi thong thu thuan thuat thuc thuong thuy thuyet",
  "thy tich tien tiep tieu tin tinh to toai toan ton tra trac trach tram tran trang tranh tri trien triet trieu trinh trong tru truc trung truong tu tuan",
  "tue tung tuong tuy tuyen tuyet ty uy uyen van vang vanh vi vien viet vinh vo vong vu vuong vy xanh xuan xuyen y yen",
]);
export const MIDDLE_NAMES = words([
  "ai an anh au ba bach ban bang bao bich binh boi buu cam canh cao cat chan chanh che chi chien chieu chinh chuan chung cong cuong da dac dai dan dang",
  "danh dat di diem dien diep dieu dinh doan don dong duc dung duong duy duyen gia giang giao ha hac hai ham han hang hanh hao hien hiep hieu ho hoa hoai",
  "hoan hoang hong huan hue hung huong huu huy huyen huynh kha khac khai khang khanh khiet khoa khoi khuc khue khuong khuyen kien kiet kieu kim ky lac",
  "lam lan lap le lien lieu linh loan loc long luc luong luu ly mai manh mau minh moc mong my nam ngan nghi nghia ngoc nguyen nguyet nha nhan nhat nhu",
  "niem oanh phi phong phu phuc phung phuoc phuong quan quang que quoc quy quyet quynh sao si son song suong sy ta tai tam tan tat thach thai thang thanh",
  "thao that the thi thien thieu thinh tho thoi thong thu thuan thuc thuong thuy thy tich tien tieu tinh to toan ton tra tram tran trang tri trien trieu",
  "trong truc trung truong tu tuan tue tung tuong tuy tuyen tuyet uy uyen van vang vanh vi vien viet vinh vu vuong vy xuan xuyen y yen",
]);
