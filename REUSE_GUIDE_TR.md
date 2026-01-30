# Projeyi Kendi Firebase Hesabınızda Kurma Rehberi

Bu proje, Firebase'in ücretsiz **Spark Planı** kullanılarak yayına alınacak şekilde tasarlanmıştır. Başka bir kullanıcının bu projeyi kendi hesabında kullanabilmesi için izlemesi gereken adımlar aşağıdadır:

## 1. Firebase Konsolu Hazırlıkları
Öncelikle [Firebase Console](https://console.firebase.google.com/) üzerinden yeni bir proje oluşturun:

*   **Authentication:** "Build" menüsünden Authentication'ı seçin ve **Email/Password** yöntemini etkinleştirin.
*   **Firestore Database:** "Build" menüsünden Firestore'u seçin. **Production Mode** (Üretim Modu) seçeneğiyle veritabanını oluşturun (Konum olarak size en yakın bölgeyi seçin, örn: `europe-west3`).
*   **Hosting:** Hosting bölümüne gidip "Get Started" diyerek kurulumu tamamlayın.

## 2. Web Uygulaması Kaydı
Firebase proje genel bakış sayfasında "Web" simgesine ( `</>` ) tıklayarak uygulamanızı kaydedin:
*   Uygulamaya bir takma ad verin (örn: `gorev-takibi-web`).
*   Size verilen `firebaseConfig` nesnesini kopyalayın.

## 3. Yerel Kod Yapılandırması
Kodu bilgisayarınıza indirdikten sonra şu adımları izleyin:

1.  **Bağımlılıkları Yükleyin:**
    ```bash
    npm install
    ```
2.  **Firebase Bilgilerini Gizli Dosyaya Ekleyin:**
    Proje kök dizininde `.env.local` isimli bir dosya oluşturun (bilgisayarınızda varsa açın) ve kendi Firebase bilgilerinizi buraya yapıştırın. `.env.local.example` dosyasını referans alabilirsiniz:
    ```bash
    NEXT_PUBLIC_FIREBASE_API_KEY=KENDI_API_KEYINIZ
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=KENDI_DOMAININIZ
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=KENDI_PROJE_IDNIZ
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=KENDI_BUCKETINIZ
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=KENDI_IDNIZ
    NEXT_PUBLIC_FIREBASE_APP_ID=KENDI_APP_IDNIZ
    ```
    *Not: Artık `src/lib/firebase.ts` dosyasını düzenlemenize gerek kalmadı, sistem bu bilgileri otomatik olarak bu dosyadan okuyacaktır.*
3.  **Proje Bağlantısını Resetleyin:**
    `.firebaserc` dosyasını açın ve `default` kısmındaki proje ID'sini kendi oluşturduğunuz projenin ID'siyle değiştirin:
    ```json
    {
      "projects": {
        "default": "YENI_PROJE_ID_BURAYA"
      }
    }
    ```

## 4. Firebase CLI ile Giriş ve Yetkilendirme
Bilgisayarınızda Firebase CLI yüklü değilse `npm install -g firebase-tools` ile yükleyin. Ardından:

```powershell
# Firebase hesabınıza giriş yapın
firebase login

# Projenizi seçin (zaten .firebaserc yaptıysanız bu adım otomatikleşir)
firebase use default
```

## 5. Veritabanı Kurallarını ve Uygulamayı Yayına Alma
Proje kök dizininde hazır bulunan `firestore.rules` dosyası, tüm yetki ve güvenlik ayarlarını içerir. Yayına aldığınızda bu kurallar otomatik olarak Firebase'e yüklenecektir.

```powershell
# Uygulamayı build edin (statik dosyaları oluşturur)
npm run build

# Kuralları ve Hosting dosyalarını yükleyin
firebase deploy
```

## Özet
Bu adımlardan sonra projeniz tamamen ücretsiz planda, kendi veritabanınız ve kullanıcı yetkilendirme sisteminizle çalışacaktır. Artık Firebase Konsolu üzerinden kullanıcıları yönetebilir ve veritabanınızı takip edebilirsiniz.
