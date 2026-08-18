using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Security.Policy;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;
using System.Xml;

namespace Dbt_Migrate
{
    /// <summary>
    /// Interaction logic for MainWindow.xaml
    /// </summary>
    public partial class MainWindow : Window, INotifyPropertyChanged
    {
        public MainWindow()
        {
            InitializeComponent();
            this.DataContext = this;

            list.ItemsSource = Liste;
            errors.ItemsSource = ErrorListe;
        }

        private ObservableCollection<string> _dbtMigrations;

        public ObservableCollection<string> DbtMigrations
        {
            get { return _dbtMigrations; }
            set
            {
                _dbtMigrations = value;
                RaisePropertyChanged();
            }
        }

        private string _SelectedDbtMigration;

        public string SelectedDbtMigration
        {
            get { return _SelectedDbtMigration; }
            set
            {
                _SelectedDbtMigration = value;
                RaisePropertyChanged();
            }
        }

        private ObservableCollection<string> _migrations;

        public ObservableCollection<string> Migrations
        {
            get { return _migrations; }
            set
            {
                _migrations = value;
                RaisePropertyChanged();
            }
        }


        private string _operation;

        public string Operation
        {
            get { return _operation; }
            set
            {
                _operation = value;
                ErrorListe = new();
                RaisePropertyChanged();
            }
        }


        private string _SelectedMigration;

        public string SelectedMigration
        {
            get { return _SelectedMigration; }
            set
            {
                _SelectedMigration = value;
                RaisePropertyChanged();
            }
        }


        private List<string> _datNames;

        public List<string> DatNames
        {
            get { return _datNames; }
            set
            {
                _datNames = value;
                RaisePropertyChanged();
            }
        }


        private ObservableCollection<string> _liste;

        public ObservableCollection<string> Liste
        {
            get { return _liste; }
            set
            {
                _liste = value;
            }
        }

        private ObservableCollection<string> _errorListe;

        public ObservableCollection<string> ErrorListe
        {
            get { return _errorListe; }
            set
            {
                _errorListe = value;
            }
        }
                       

        #region INPC
        public event PropertyChangedEventHandler PropertyChanged;

        public void RaisePropertyChanged([CallerMemberName] string propertyName = null)
        {
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
        }
        #endregion

        private async void RevertButton_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/revert-migration-by-id/";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/revert-migration-by-id/";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/revert-migration-by-id/";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/revert-migration-by-id/";
            }

            Operation = $"Revert Migrate - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {urlValue.Text} - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            for (int i = start; i < end; i++)
            {
                if (DatNames != null && DatNames.Any())
                {
                    var index = DatNames.IndexOf($"Dbt_{i}");
                    if (index < 0)
                    {
                        continue;
                    }
                }

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                client.DefaultRequestHeaders.Add("Keep-Alive", "600");

                string url1 = $"{url}/{i}/{urlValue.Text}";

                var response = await client.GetAsync(url1);

                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    Liste.Add(responseContent);

                    list.ItemsSource = Liste;

                    RaisePropertyChanged(nameof(Liste));

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);


                    await Task.Delay(1000);

                }
                else
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                    ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    await Task.Delay(15000);
                }

                client.Dispose();
            }
            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

        }

        #region durum paneli
        /// <summary>Durum panelinde işlemin bittiğini gösteren aşama adı.</summary>
        private const string FinishedPhase = "Tamamlandı";

        private string _statusText = "Hazır";

        /// <summary>Durum panelindeki açıklama (hangi işlem, hangi aşamada).</summary>
        public string StatusText
        {
            get { return _statusText; }
            set
            {
                _statusText = value;
                RaisePropertyChanged();
            }
        }

        private Brush _statusBrush = Brushes.Gray;

        /// <summary>Durum ışığı: gri = hazır, mavi = çalışıyor, yeşil = hatasız bitti, turuncu = hatalı bitti.</summary>
        public Brush StatusBrush
        {
            get { return _statusBrush; }
            set
            {
                _statusBrush = value;
                RaisePropertyChanged();
            }
        }

        // Sayaçlar iş başına güncellendiği için setter'lar değişmeyen değerde bildirim üretmez.
        private int _queuedCount;

        public int QueuedCount
        {
            get { return _queuedCount; }
            set
            {
                if (_queuedCount == value)
                {
                    return;
                }

                _queuedCount = value;
                RaisePropertyChanged();
            }
        }

        private int _successCount;

        public int SuccessCount
        {
            get { return _successCount; }
            set
            {
                if (_successCount == value)
                {
                    return;
                }

                _successCount = value;
                RaisePropertyChanged();
            }
        }

        private int _errorCount;

        public int ErrorCount
        {
            get { return _errorCount; }
            set
            {
                if (_errorCount == value)
                {
                    return;
                }

                _errorCount = value;
                RaisePropertyChanged();
            }
        }

        private int _skippedCount;

        public int SkippedCount
        {
            get { return _skippedCount; }
            set
            {
                if (_skippedCount == value)
                {
                    return;
                }

                _skippedCount = value;
                RaisePropertyChanged();
            }
        }

        private int _pendingCount;

        public int PendingCount
        {
            get { return _pendingCount; }
            set
            {
                if (_pendingCount == value)
                {
                    return;
                }

                _pendingCount = value;
                RaisePropertyChanged();
            }
        }

        /// <summary>Yeni bir işlem başlarken durum panelini sıfırlar.</summary>
        private void ResetStatus(string text)
        {
            QueuedCount = 0;
            SuccessCount = 0;
            ErrorCount = 0;
            SkippedCount = 0;
            PendingCount = 0;

            StatusText = text;
            StatusBrush = Brushes.DodgerBlue;
        }

        private void SetStatus(string text, bool isFinished, bool hasError)
        {
            StatusText = text;

            StatusBrush = !isFinished
                ? Brushes.DodgerBlue
                : hasError
                    ? Brushes.OrangeRed
                    : Brushes.LimeGreen;
        }
        #endregion

        #region liste kopyalama
        /// <summary>Sağ tuş menüsündeki "Kopyala": seçili satır(lar)ı panoya alır.</summary>
        private void CopySelected_Click(object sender, RoutedEventArgs e)
        {
            ListBox listBox = GetContextMenuListBox(sender);

            if (listBox == null || listBox.SelectedItems.Count == 0)
            {
                return;
            }

            CopyToClipboard(listBox.SelectedItems.Cast<object>());
        }

        /// <summary>Sağ tuş menüsündeki "Tümünü Kopyala": listedeki bütün satırları panoya alır.</summary>
        private void CopyAll_Click(object sender, RoutedEventArgs e)
        {
            ListBox listBox = GetContextMenuListBox(sender);

            if (listBox == null || listBox.Items.Count == 0)
            {
                return;
            }

            CopyToClipboard(listBox.Items.Cast<object>());
        }

        /// <summary>Listelerde Ctrl+C ile de kopyalanabilsin.</summary>
        private void ResultList_PreviewKeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key != Key.C || (Keyboard.Modifiers & ModifierKeys.Control) != ModifierKeys.Control)
            {
                return;
            }

            if (sender is ListBox listBox && listBox.SelectedItems.Count > 0)
            {
                CopyToClipboard(listBox.SelectedItems.Cast<object>());

                e.Handled = true;
            }
        }

        private static ListBox GetContextMenuListBox(object sender)
        {
            if (sender is MenuItem menuItem && menuItem.Parent is ContextMenu contextMenu)
            {
                return contextMenu.PlacementTarget as ListBox;
            }

            return null;
        }

        private static void CopyToClipboard(IEnumerable<object> items)
        {
            string text = string.Join(Environment.NewLine, items.Select(d => d != null ? d.ToString() : ""));

            if (string.IsNullOrEmpty(text))
            {
                return;
            }

            try
            {
                Clipboard.SetText(text);
            }
            catch (Exception)
            {
                // Pano başka bir uygulama tarafından kilitlenmiş olabilir; kopyalama yapılamazsa sessizce geç.
            }
        }
        #endregion

        /// <summary>Arka plan migration işinin durumu sorgulanırken kullanılan bekleyen iş kaydı.</summary>
        private class DbtMigrateJobItem
        {
            /// <summary>URL'de gidecek paket değeri ("0" => Dbt_Temp).</summary>
            public string PackNo { get; set; }

            /// <summary>Listede gösterilecek ad ("Dbt_500104" / "Dbt_Temp").</summary>
            public string DisplayName { get; set; }

            public string JobId { get; set; }

            /// <summary>Liste içindeki satır indeksi — iş bitince o satır yerinde güncellenir.</summary>
            public int LineIndex { get; set; }
        }

        /// <summary>
        /// Kuyruğa alma sürerken izlemenin başlaması için gereken en az iş sayısı: ilk paketler koşmaya
        /// başlamışken kuyruğa almanın bitmesini beklemek, tamamlananların dakikalarca görünmemesine
        /// yol açıyordu.
        /// </summary>
        private const int MonitorStartThreshold = 50;

        /// <summary>Tek toplu durum isteğinde sorulacak jobId sayısı (sunucu tarafı sınırı 500).</summary>
        private const int StatusBatchSize = 200;

        /// <summary>İzleme turları arasındaki bekleme (ms).</summary>
        private const int MonitorRoundDelayMs = 3000;

        /// <summary>
        /// Akış kontrolü: bekleyen iş sayısı bu sınıra ulaştığında kuyruğa alma duraklar, işler bitip
        /// sayı düşünce devam eder. Hangfire kuyruğunun binlerce işle şişmesini ve iptal etmek
        /// istediğinde geri dönüşü olmayan bir yığın oluşmasını engeller.
        /// (İzleme eşiğinden büyük olmalı; aksi hâlde izleme başlamadan kuyruğa alma kilitlenir.)
        /// </summary>
        private const int MaxPendingJobs = 200;

        /// <summary>Ekrandaki start/end kutularından üretilen işlenecek veritabanı hedefi.</summary>
        private class PackTarget
        {
            /// <summary>URL'de gidecek paket değeri ("0" => sunucu tarafında Dbt_Temp).</summary>
            public string PackNo { get; set; }

            /// <summary>Yalnız aralık modunda dolu: aralığın bitiş paketi.</summary>
            public string PackNoEnding { get; set; }

            public string DisplayName { get; set; }
        }

        /// <summary>api/master/dbt-migrate-all-bg yanıtı.</summary>
        private class DbtMigrateEnqueueResult
        {
            public bool IsOk { get; set; }

            public int PackNoStarting { get; set; }

            public string MigrationId { get; set; }

            public string JobId { get; set; }

            public string StatusUrl { get; set; }

            public string Message { get; set; }
        }

        /// <summary>api/master/dbt-migrate-status yanıtı.</summary>
        private class DbtMigrateJobStatus
        {
            public string JobId { get; set; }

            public string State { get; set; }

            public bool IsFound { get; set; }

            public bool IsFinished { get; set; }

            public bool IsSucceeded { get; set; }

            public int OkCount { get; set; }

            public int FailCount { get; set; }

            public int SkippedCount { get; set; }

            public List<string> Failures { get; set; }

            public string Message { get; set; }

            public string Error { get; set; }
        }

        /// <summary>Seçili servisin api kökü (örn. https://hw.unideva.com/svc/api).</summary>
        private string GetApiBaseUrl(string cText)
        {
            if (cText == "Local")
            {
                return @"http://localhost:44305/api";
            }

            if (cText == "Pre Test")
            {
                return @"http://devatek.deva.zone/svc/api";
            }

            if (cText == "Test" || cText == "PreProd")
            {
                return @"https://test.unideva.com/svc/api";
            }

            if (cText == "Prod")
            {
                return @"https://hw.unideva.com/svc/api";
            }

            return "";
        }

        /// <summary>Prod seçiliyse onay ister; diğer ortamlarda doğrudan geçer.</summary>
        private bool ConfirmProd(string cText)
        {
            if (cText != "Prod")
            {
                return true;
            }

            MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation",
                System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);

            return messageBoxResult == MessageBoxResult.Yes;
        }

        /// <summary>Sunucudan Dbt_{prefix}% ile eşleşen veritabanı adlarını okur.</summary>
        private async Task<List<string>> GetDbtDatNamesAsync(string apiBaseUrl, string prefix)
        {
            try
            {
                using HttpClient client = new() { Timeout = TimeSpan.FromMinutes(2) };

                HttpResponseMessage response = await client.GetAsync($"{apiBaseUrl}/master/get-dbtdatnames/{prefix}");

                if (response.StatusCode != HttpStatusCode.OK)
                {
                    return new List<string>();
                }

                string responseContent = await response.Content.ReadAsStringAsync();

                return JsonSerializer.Deserialize<List<string>>(responseContent) ?? new List<string>();
            }
            catch (Exception)
            {
                return new List<string>();
            }
        }

        /// <summary>
        /// Start/End kutularına göre işlenecek hedefleri üretir:
        /// - Start boş veya sayı değil: boş liste (çağıran uyarır)
        /// - Start = 0: tek hedef Dbt_Temp (sunucu tarafı packNo 0'ı Dbt_Temp'e çevirir)
        /// - End boş/geçersiz: Start ile BAŞLAYAN paketler (prefix). Önce yüklü DatNames'e bakar,
        ///   yoksa get-dbtdatnames ile sunucudan çeker — böylece End yazmamak hata vermez.
        /// - End dolu: Start..End aralığı (DatNames yüklüyse var olmayan paketler atlanır)
        /// </summary>
        private async Task<List<PackTarget>> GetPackTargetsAsync(string apiBaseUrl)
        {
            List<PackTarget> targets = new();

            string startText = (tbstart.Text ?? "").Trim();

            if (!int.TryParse(startText, out int start))
            {
                return targets;
            }

            if (start == 0)
            {
                targets.Add(new PackTarget { PackNo = "0", DisplayName = "Dbt_Temp", });

                return targets;
            }

            string endText = (tbend.Text ?? "").Trim();

            if (int.TryParse(endText, out int end) && end >= start)
            {
                for (int i = start; i <= end; i++)
                {
                    if (DatNames != null && DatNames.Any() && !DatNames.Contains($"Dbt_{i}"))
                    {
                        continue;
                    }

                    targets.Add(new PackTarget { PackNo = i.ToString(), DisplayName = $"Dbt_{i}", });
                }

                return targets;
            }

            List<string> datNames = DatNames != null
                ? DatNames.Where(d => d.StartsWith($"Dbt_{start}")).ToList()
                : new List<string>();

            if (!datNames.Any())
            {
                datNames = await GetDbtDatNamesAsync(apiBaseUrl, start.ToString());
            }

            foreach (string datName in datNames.OrderBy(d => d))
            {
                string packNo = datName.Replace("Dbt_", "");

                if (packNo.Length == 6 && int.TryParse(packNo, out _))
                {
                    targets.Add(new PackTarget { PackNo = packNo, DisplayName = datName, });
                }
            }

            return targets;
        }

        /// <summary>
        /// Kuyruk + izleme akışı: (1) her hedef için iş kuyruğa alınır ve jobId alınır, (2) işler bitene
        /// kadar durum sorgulanır; biten hedefin satırı yerinde "tamamlandı" olarak güncellenir, hatalı
        /// olan hatalı listesine taşınır. Uzun süren migration'larda HttpClient'ın 100 sn'lik timeout'una
        /// düşülmez. Hem Dbt migration (dbt-migrate-all-bg) hem EF migration (migrate-bg) için kullanılır.
        /// </summary>
        private async Task RunQueuedOperationAsync(string operationName, string headerText, string apiBaseUrl,
            List<PackTarget> targets, Func<PackTarget, string> enqueueUrlBuilder)
        {
            string statusBulkUrl = $"{apiBaseUrl}/master/dbt-migrate-status-bulk";

            ResetStatus($"{operationName} - Başladı");

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {headerText}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;
            errors.ItemsSource = ErrorListe;

            RaisePropertyChanged(nameof(Liste));
            RaisePropertyChanged(nameof(ErrorListe));

            int queuedCount = 0;
            int successCount = 0;
            int errorCount = 0;
            int skippedCount = 0;

            List<DbtMigrateJobItem> pending = new();

            JsonSerializerOptions jsonOptions = new() { PropertyNameCaseInsensitive = true };

            // Kuyruğa alma ve durum sorgusu anında döner; uzun bekleyen istek kalmadı.
            using var client = new HttpClient();
            client.Timeout = TimeSpan.FromMinutes(2);
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");

            void UpdateOperation(string phase)
            {
                string skipped = skippedCount > 0 ? $" | Atlanan: {skippedCount}" : "";

                _operation = $"{operationName} - {phase} | Kuyruğa alınan: {queuedCount} | Başarılı: {successCount} | Hatalı: {errorCount}{skipped} | Bekleyen: {pending.Count}";
                RaisePropertyChanged(nameof(Operation));

                QueuedCount = queuedCount;
                SuccessCount = successCount;
                ErrorCount = errorCount;
                SkippedCount = skippedCount;
                PendingCount = pending.Count;

                bool isFinished = phase == FinishedPhase;

                SetStatus($"{operationName} - {phase}", isFinished, errorCount > 0);
            }

            void ScrollListToEnd()
            {
                if (list.Items.Count > 0)
                {
                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);
                }
            }

            void AddError(string message)
            {
                ErrorListe.Add(message);
                RaisePropertyChanged(nameof(ErrorListe));

                if (errors.Items.Count > 0)
                {
                    errors.SelectedIndex = errors.Items.Count - 1;
                    errors.ScrollIntoView(errors.SelectedItem);
                }
            }

            if (targets == null || !targets.Any())
            {
                Liste.Add("         işlenecek veritabanı bulunamadı - Start kutusunu kontrol edin (0 = Dbt_Temp)");
                ScrollListToEnd();
                UpdateOperation(FinishedPhase);

                return;
            }

            bool isEnqueueDone = false;
            bool isMonitorStarted = false;

            string CurrentPhase()
            {
                if (!isEnqueueDone)
                {
                    return isMonitorStarted ? "Kuyruğa alınıyor + izleniyor" : "Kuyruğa alınıyor";
                }

                return "İzleniyor";
            }

            // Kuyruğa alma ve izleme aynı anda koşar: binlerce paketlik listede kuyruğa alma dakikalar
            // sürüyor, bu sürede biten işlerin listede ve sayaçlarda görünmesi gerekiyor. İki döngü de
            // UI thread'inin senkronizasyon bağlamında ilerlediği için koleksiyonlar üzerinde kilit
            // gerekmiyor (await noktalarında sırayla çalışırlar).
            Task enqueueTask = EnqueueAllAsync();
            Task monitorTask = MonitorAsync();

            await Task.WhenAll(enqueueTask, monitorTask);

            string skippedText = skippedCount > 0 ? $" - Atlanan: {skippedCount}" : "";

            Liste.Add("         *********************      ");
            Liste.Add($"              Tamamlandı - Kuyruğa alınan: {queuedCount} - Başarılı: {successCount} - Hatalı: {errorCount}{skippedText}");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            ScrollListToEnd();
            RaisePropertyChanged(nameof(Liste));

            UpdateOperation(FinishedPhase);

            // ----- kuyruğa alma döngüsü -----
            async Task EnqueueAllAsync()
            {
                foreach (PackTarget target in targets)
                {
                    // Akış kontrolü: kuyrukta bekleyen iş sınırı aşıldıysa yeni iş atma, işler eritilsin.
                    while (pending.Count >= MaxPendingJobs)
                    {
                        UpdateOperation($"Kuyruk dolu ({pending.Count}), bekleniyor");

                        await Task.Delay(1000);
                    }

                    string url1 = enqueueUrlBuilder(target);

                    HttpResponseMessage response = null;

                    try
                    {
                        response = await client.GetAsync(url1);
                        string responseContent = await response.Content.ReadAsStringAsync();

                        DbtMigrateEnqueueResult result = response.StatusCode == HttpStatusCode.OK && !string.IsNullOrWhiteSpace(responseContent)
                            ? JsonSerializer.Deserialize<DbtMigrateEnqueueResult>(responseContent, jsonOptions)
                            : null;

                        if (result != null && !string.IsNullOrWhiteSpace(result.JobId))
                        {
                            ++queuedCount;

                            Liste.Add($"{target.DisplayName} --> kuyruğa alındı (jobId: {result.JobId})");

                            pending.Add(new DbtMigrateJobItem
                            {
                                PackNo = target.PackNo,
                                DisplayName = target.DisplayName,
                                JobId = result.JobId,
                                LineIndex = Liste.Count - 1,
                            });
                        }
                        else
                        {
                            ++errorCount;

                            Liste.Add($"{target.DisplayName} --> kuyruğa alınamadı");
                            AddError($"{target.DisplayName} - Status Code: {response.StatusCode} -- {responseContent}");
                        }
                    }
                    catch (Exception exx)
                    {
                        string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;

                        ++errorCount;

                        Liste.Add($"{target.DisplayName} --> kuyruğa alınamadı");
                        AddError($"{target.DisplayName} - Status Code: {response?.StatusCode} -- {error}");
                    }

                    UpdateOperation(CurrentPhase());
                    ScrollListToEnd();
                }

                isEnqueueDone = true;

                Liste.Add($"         {queuedCount} adet iş kuyruğa alındı, durum izleniyor...");
                ScrollListToEnd();
            }

            // ----- izleme döngüsü -----
            async Task MonitorAsync()
            {
                // Kuyruğa alma bitmesini beklemeye gerek yok: eşik kadar iş kuyruğa girdiğinde (ya da
                // kuyruğa alma bittiğinde) izleme başlar, biten işler anında listeden ve sayaçlardan düşer.
                while (!isEnqueueDone && queuedCount < MonitorStartThreshold)
                {
                    await Task.Delay(500);
                }

                isMonitorStarted = true;

                while (!isEnqueueDone || pending.Any())
                {
                    if (!pending.Any())
                    {
                        await Task.Delay(500);

                        continue;
                    }

                    List<DbtMigrateJobItem> snapshot = pending.ToList();

                    for (int i = 0; i < snapshot.Count; i += StatusBatchSize)
                    {
                        List<DbtMigrateJobItem> batch = snapshot.Skip(i).Take(StatusBatchSize).ToList();

                        List<DbtMigrateJobStatus> statuses = await GetStatusesAsync(batch.Select(d => d.JobId).ToList());

                        if (statuses == null)
                        {
                            // Geçici ağ/servis hatası: işler sunucuda koşmaya devam eder, sonraki turda tekrar sorulur.
                            continue;
                        }

                        Dictionary<string, DbtMigrateJobStatus> statusMap = statuses
                            .Where(d => d != null && !string.IsNullOrWhiteSpace(d.JobId))
                            .GroupBy(d => d.JobId)
                            .ToDictionary(g => g.Key, g => g.First());

                        foreach (DbtMigrateJobItem item in batch)
                        {
                            if (!statusMap.TryGetValue(item.JobId, out DbtMigrateJobStatus status))
                            {
                                continue;
                            }

                            ApplyStatus(item, status);
                        }

                        UpdateOperation(CurrentPhase());
                    }

                    if (!isEnqueueDone || pending.Any())
                    {
                        await Task.Delay(MonitorRoundDelayMs);
                    }
                }
            }

            // Tek işin durumunu listeye/sayaçlara yazar; iş bittiyse bekleyenlerden düşer.
            void ApplyStatus(DbtMigrateJobItem item, DbtMigrateJobStatus status)
            {
                if (!status.IsFound)
                {
                    // Hangfire kaydı bulunamadı (silinmiş/temizlenmiş) — işin akıbeti bilinmiyor.
                    pending.Remove(item);
                    ++errorCount;

                    Liste[item.LineIndex] = $"{item.DisplayName} --> durum bulunamadı (jobId: {item.JobId})";
                    AddError($"{item.DisplayName} - durum bulunamadı (jobId: {item.JobId}) -- Hangfire panelinden kontrol edin");

                    UpdateOperation(CurrentPhase());

                    return;
                }

                if (!status.IsFinished)
                {
                    Liste[item.LineIndex] = $"{item.DisplayName} --> {status.State} | {status.Message}";

                    return;
                }

                pending.Remove(item);

                if (status.IsSucceeded && status.SkippedCount > 0 && status.OkCount == 0)
                {
                    ++skippedCount;

                    Liste[item.LineIndex] = $"{item.DisplayName} --> atlandı (migration uygulanacak veritabanı bulunamadı)";
                }
                else if (status.IsSucceeded)
                {
                    ++successCount;

                    Liste[item.LineIndex] = $"{item.DisplayName} --> tamamlandı | {status.Message}";
                }
                else
                {
                    ++errorCount;

                    string detail = status.Failures != null && status.Failures.Any()
                        ? string.Join(" | ", status.Failures)
                        : status.Error;

                    Liste[item.LineIndex] = $"{item.DisplayName} --> HATALI | {status.Message}";
                    AddError($"{item.DisplayName} - {status.State} -- {status.Message} {detail}");
                }

                UpdateOperation(CurrentPhase());
            }

            // Durumlar tek tek değil, toplu uçtan (dbt-migrate-status-bulk) okunur — binlerce iş için
            // iş başına bir HTTP isteği hem çok yavaş hem de Hangfire deposuna gereksiz yük.
            async Task<List<DbtMigrateJobStatus>> GetStatusesAsync(List<string> jobIds)
            {
                try
                {
                    using StringContent content = new(JsonSerializer.Serialize(jobIds), Encoding.UTF8, "application/json");
                    using HttpResponseMessage response = await client.PostAsync(statusBulkUrl, content);

                    if (response.StatusCode != HttpStatusCode.OK)
                    {
                        return null;
                    }

                    string responseContent = await response.Content.ReadAsStringAsync();

                    return JsonSerializer.Deserialize<List<DbtMigrateJobStatus>>(responseContent, jsonOptions);
                }
                catch (Exception)
                {
                    return null;
                }
            }
        }

        /// <summary>
        /// Dbt migration'ı sunucuda Hangfire kuyruğunda koşturur (dbt-migrate-all-bg) ve durumunu izler.
        /// Start ile başlayan paketler; End boşsa prefix modu, Start 0 ise Dbt_Temp.
        /// </summary>
        public async Task DbtMigrate()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;
            string dbtMigrationName = cmbDbtMigrate.Text;

            if (string.IsNullOrWhiteSpace(dbtMigrationName))
            {
                _ = System.Windows.MessageBox.Show("Dbt Migrate Name seçilmedi!", "Dbt-Migrate", System.Windows.MessageBoxButton.OK, MessageBoxImage.Warning);

                return;
            }

            if (!ConfirmProd(cText))
            {
                return;
            }

            string apiBaseUrl = GetApiBaseUrl(cText);

            Operation = $"Dbt-Migration (kuyruk) - {apiBaseUrl}/master/dbt-migrate-all-bg";

            List<PackTarget> targets = await GetPackTargetsAsync(apiBaseUrl);

            // Aralık modu: paket başına iş açmak yerine tüm aralık için tek sıralı iş.
            PackTarget rangeTarget = GetRangeTarget(targets);

            if (rangeTarget != null)
            {
                string rangeUrl = $"{apiBaseUrl}/master/dbt-migrate-between-bg/{rangeTarget.PackNo}/{rangeTarget.PackNoEnding}/{dbtMigrationName}";

                await RunQueuedOperationAsync(
                    operationName,
                    $"{apiBaseUrl}/master/dbt-migrate-between-bg - {dbtMigrationName}",
                    apiBaseUrl,
                    new List<PackTarget> { rangeTarget },
                    target => rangeUrl);

                return;
            }

            await RunQueuedOperationAsync(
                operationName,
                $"{apiBaseUrl}/master/dbt-migrate-all-bg - {dbtMigrationName}",
                apiBaseUrl,
                targets,
                target => $"{apiBaseUrl}/master/dbt-migrate-all-bg/{target.PackNo}/{dbtMigrationName}");
        }

        /// <summary>
        /// Aralık modu işaretliyse hedef listesinden tek bir aralık hedefi üretir (ilk ve son paket no).
        /// Mod kapalıysa, hedef tek ise (ör. Dbt_Temp) ya da paket numarası çözülemiyorsa null döner —
        /// bu durumda paket başına iş açan normal akış kullanılır.
        /// </summary>
        private PackTarget GetRangeTarget(List<PackTarget> targets)
        {
            if (chkBetweenMode.IsChecked != true || targets == null || targets.Count < 2)
            {
                return null;
            }

            List<int> packNos = targets
                .Select(d => int.TryParse(d.PackNo, out int packNo) ? packNo : 0)
                .Where(d => d > 0)
                .OrderBy(d => d)
                .ToList();

            if (!packNos.Any())
            {
                return null;
            }

            int first = packNos.First();
            int last = packNos.Last();

            return new PackTarget
            {
                PackNo = first.ToString(),
                PackNoEnding = last.ToString(),
                DisplayName = $"Dbt_{first} - Dbt_{last} (aralık, {targets.Count} db)",
            };
        }

        #region migration takip (geçmiş / paket durumu)
        /// <summary>
        /// Takip sorguları sunucu tarafında paket paket veritabanı taradığı için (binlerce vt olabilir)
        /// istek dakikalar sürebilir. Kuyruk gerekmiyor — tek istek, tek yanıt.
        /// </summary>
        private static readonly TimeSpan TrackingRequestTimeout = TimeSpan.FromMinutes(10);

        /// <summary>API'deki <c>DbtMigrationHistoryItem</c>'ın istemci kopyası.</summary>
        private class DbtMigrationHistoryItem
        {
            public string MigrationId { get; set; }

            public DateTime FirstAppliedAt { get; set; }

            public DateTime LastAppliedAt { get; set; }

            public bool IsOk { get; set; }

            public int RunCount { get; set; }

            public int FailCount { get; set; }

            public long DurationMs { get; set; }

            public int StepCount { get; set; }

            public int StepFailCount { get; set; }

            public string TriggerKind { get; set; }

            public string AppliedBy { get; set; }

            public string Message { get; set; }
        }

        /// <summary>API'deki <c>DbtMigrationPackState</c>'in istemci kopyası.</summary>
        private class DbtMigrationPackState
        {
            public string PackNo { get; set; }

            public string MigrationId { get; set; }

            public bool IsTracked { get; set; }

            public bool IsApplied { get; set; }

            public bool IsOk { get; set; }

            public DateTime? LastAppliedAt { get; set; }

            public int RunCount { get; set; }

            public int FailCount { get; set; }

            public string TriggerKind { get; set; }

            public string Message { get; set; }

            public string Error { get; set; }
        }

        /// <summary>
        /// Tek paketin Dbt migration geçmişi: <c>__dbt_migrations_history</c> tablosundaki satırlar.
        /// Start kutusuna tam paket numarası yazılır (0 = Dbt_Temp) — geçmiş paket bazında okunur.
        /// </summary>
        public async Task MigrationHistory()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;
            string startText = (tbstart.Text ?? "").Trim();

            if (!int.TryParse(startText, out int packNo) || (packNo != 0 && startText.Length != 6))
            {
                _ = System.Windows.MessageBox.Show(
                    "Start kutusuna tam paket numarası yazın (6 hane) ya da Dbt_Temp için 0.",
                    "Migration Geçmişi", System.Windows.MessageBoxButton.OK, MessageBoxImage.Warning);

                return;
            }

            if (!ConfirmProd(cText))
            {
                return;
            }

            string apiBaseUrl = GetApiBaseUrl(cText);
            string packName = packNo == 0 ? "Dbt_Temp" : $"Dbt_{packNo}";
            string url = $"{apiBaseUrl}/master/dbt-migration-history/{packNo}";

            Operation = $"Migration Geçmişi - {url}";

            BeginSimpleOperation(operationName, $"{packName} - {url}");

            int successCount = 0;
            int errorCount = 0;

            try
            {
                List<DbtMigrationHistoryItem> history = await GetJsonAsync<List<DbtMigrationHistoryItem>>(url);

                if (history == null || !history.Any())
                {
                    Liste.Add($"{packName} --> takip kaydı yok");
                    Liste.Add("         Sebep: bu vt'de __dbt_migrations_history tablosu hiç oluşmamış olabilir.");
                    Liste.Add("         Çözüm: 1-Dbt-Migrate ile MigrationHistoryInit koşturun (EF geçmişinden geriye dönük doldurur).");
                }
                else
                {
                    foreach (DbtMigrationHistoryItem item in history)
                    {
                        string line = GetHistoryLine(item);

                        Liste.Add(line);

                        if (item.IsOk)
                        {
                            ++successCount;
                        }
                        else
                        {
                            ++errorCount;

                            AddErrorLine($"{packName} - {line}");
                        }
                    }
                }
            }
            catch (Exception exx)
            {
                ++errorCount;

                string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;

                Liste.Add($"{packName} --> geçmiş okunamadı");
                AddErrorLine($"{packName} - {error}");
            }

            EndSimpleOperation(operationName,
                $"{packName} - Kayıt: {successCount + errorCount} - Başarılı: {successCount} - Hatalı: {errorCount}",
                successCount, errorCount);
        }

        /// <summary>
        /// Seçili Dbt migration'ın paket paket durumu: hangi pakete uygulandı, hangisinde hatalı bitti,
        /// hangisi hiç takip edilmemiş. Start kutusu paket ön eki olarak çalışır (sunucu
        /// <c>Dbt_{start}%</c> ile tarar, 0 = Dbt_Temp) — End kutusu bu işlemde kullanılmaz.
        /// </summary>
        public async Task MigrationPacks()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;
            string dbtMigrationName = cmbDbtMigrate.Text;
            string startText = (tbstart.Text ?? "").Trim();

            if (string.IsNullOrWhiteSpace(dbtMigrationName))
            {
                _ = System.Windows.MessageBox.Show("Dbt Migrate Name seçilmedi!", "Migration Takip",
                    System.Windows.MessageBoxButton.OK, MessageBoxImage.Warning);

                return;
            }

            if (!int.TryParse(startText, out int packNoStarting))
            {
                _ = System.Windows.MessageBox.Show(
                    "Start kutusuna paket ön eki ya da tam paket numarası yazın (0 = Dbt_Temp).",
                    "Migration Takip", System.Windows.MessageBoxButton.OK, MessageBoxImage.Warning);

                return;
            }

            if (!ConfirmProd(cText))
            {
                return;
            }

            bool onlyMissing = chkOnlyMissing.IsChecked == true;

            string apiBaseUrl = GetApiBaseUrl(cText);
            string url = $"{apiBaseUrl}/master/dbt-migration-packs/{packNoStarting}/{dbtMigrationName}?onlyMissing={onlyMissing.ToString().ToLowerInvariant()}";

            Operation = $"Migration Takip - {url}";

            string scope = packNoStarting == 0 ? "Dbt_Temp" : $"{packNoStarting} ile başlayan paketler";

            BeginSimpleOperation(operationName,
                $"{scope} - {dbtMigrationName}{(onlyMissing ? " (yalnız eksik/hatalı)" : "")}");

            Liste.Add("         paketler taranıyor, büyük aralıklarda birkaç dakika sürebilir...");

            int successCount = 0;
            int errorCount = 0;

            try
            {
                List<DbtMigrationPackState> states = await GetJsonAsync<List<DbtMigrationPackState>>(url);

                if (states == null || !states.Any())
                {
                    Liste.Add(onlyMissing
                        ? $"{dbtMigrationName} --> eksik/hatalı paket bulunamadı (taranan aralıkta hepsi uygulanmış)"
                        : $"{dbtMigrationName} --> taranacak paket bulunamadı - Start kutusunu kontrol edin (0 = Dbt_Temp)");
                }
                else
                {
                    foreach (DbtMigrationPackState state in states)
                    {
                        string line = GetPackStateLine(state);

                        Liste.Add(line);

                        if (state.IsApplied && state.IsOk)
                        {
                            ++successCount;
                        }
                        else
                        {
                            ++errorCount;

                            AddErrorLine(line);
                        }
                    }
                }
            }
            catch (Exception exx)
            {
                ++errorCount;

                string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;

                Liste.Add($"{dbtMigrationName} --> takip durumu okunamadı");
                AddErrorLine($"{scope} - {dbtMigrationName} - {error}");
            }

            EndSimpleOperation(operationName,
                $"{dbtMigrationName} - Paket: {successCount + errorCount} - Uygulanmış: {successCount} - Eksik/Hatalı: {errorCount}",
                successCount, errorCount);
        }

        private static string GetHistoryLine(DbtMigrationHistoryItem item)
        {
            string steps = item.StepCount > 0
                ? $" | adım: {item.StepCount - item.StepFailCount}/{item.StepCount}"
                : "";

            string runs = item.RunCount > 1 ? $" | koşu: {item.RunCount}" : "";

            string fails = item.FailCount > 0 ? $" | hatalı koşu: {item.FailCount}" : "";

            string state = item.IsOk ? "OK" : "HATA";

            string message = !string.IsNullOrWhiteSpace(item.Message) ? $" -> {item.Message}" : "";

            return $"{item.MigrationId} --> {state} | {item.TriggerKind} | {item.LastAppliedAt:dd.MM.yyyy HH:mm:ss}" +
                $" | {GetDurationText(item.DurationMs)}{steps}{runs}{fails} | {item.AppliedBy}{message}";
        }

        private static string GetPackStateLine(DbtMigrationPackState state)
        {
            string packName = state.PackNo == "Temp" ? "Dbt_Temp" : $"Dbt_{state.PackNo}";

            if (!string.IsNullOrWhiteSpace(state.Error))
            {
                return $"{packName} --> OKUNAMADI -> {state.Error}";
            }

            if (!state.IsTracked)
            {
                return $"{packName} --> TAKİP YOK (MigrationHistoryInit koşturulmalı)";
            }

            if (!state.IsApplied)
            {
                return $"{packName} --> UYGULANMADI";
            }

            string runs = state.RunCount > 1 ? $" | koşu: {state.RunCount}" : "";

            string message = !string.IsNullOrWhiteSpace(state.Message) ? $" -> {state.Message}" : "";

            string appliedAt = state.LastAppliedAt.HasValue
                ? state.LastAppliedAt.Value.ToString("dd.MM.yyyy HH:mm:ss")
                : "";

            if (!state.IsOk)
            {
                return $"{packName} --> HATALI | {state.TriggerKind} | {appliedAt}{runs} | hatalı koşu: {state.FailCount}{message}";
            }

            return $"{packName} --> uygulandı | {state.TriggerKind} | {appliedAt}{runs}";
        }

        private static string GetDurationText(long durationMs)
        {
            if (durationMs <= 0)
            {
                return "-";
            }

            return durationMs >= 1000
                ? $"{durationMs / 1000.0:0.#} sn"
                : $"{durationMs} ms";
        }

        /// <summary>
        /// Kuyruk gerektirmeyen (tek istekli) işlemler için liste/durum panelini hazırlar —
        /// <see cref="RunQueuedOperationAsync"/>'ın başlangıç bloğunun sadeleştirilmiş hâli.
        /// </summary>
        private void BeginSimpleOperation(string operationName, string headerText)
        {
            ResetStatus($"{operationName} - Başladı");

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>
            {
                "         *********************      ",
                $"              Başladı - {headerText}",
                "         *********************      ",
            };

            list.ItemsSource = Liste;
            errors.ItemsSource = ErrorListe;

            RaisePropertyChanged(nameof(Liste));
            RaisePropertyChanged(nameof(ErrorListe));
        }

        private void EndSimpleOperation(string operationName, string summary, int successCount, int errorCount)
        {
            Liste.Add("         *********************      ");
            Liste.Add($"              Tamamlandı - {summary}");
            Liste.Add("         *********************      ");
            Liste.Add("         ");

            RaisePropertyChanged(nameof(Liste));

            if (list.Items.Count > 0)
            {
                list.SelectedIndex = list.Items.Count - 1;
                list.ScrollIntoView(list.SelectedItem);
            }

            SuccessCount = successCount;
            ErrorCount = errorCount;
            PendingCount = 0;

            _operation = $"{operationName} - {FinishedPhase} | {summary}";
            RaisePropertyChanged(nameof(Operation));

            SetStatus($"{operationName} - {FinishedPhase}", true, errorCount > 0);
        }

        private void AddErrorLine(string message)
        {
            ErrorListe.Add(message);
            RaisePropertyChanged(nameof(ErrorListe));

            if (errors.Items.Count > 0)
            {
                errors.SelectedIndex = errors.Items.Count - 1;
                errors.ScrollIntoView(errors.SelectedItem);
            }
        }

        /// <summary>GET isteği atıp yanıtı T olarak çözer; HTTP hata kodunda gövdeyi mesaja koyar.</summary>
        private static async Task<T> GetJsonAsync<T>(string url)
        {
            using HttpClient client = new() { Timeout = TrackingRequestTimeout };
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");

            HttpResponseMessage response = await client.GetAsync(url);

            string responseContent = await response.Content.ReadAsStringAsync();

            if (response.StatusCode != HttpStatusCode.OK)
            {
                throw new Exception($"Status Code: {response.StatusCode} -- {responseContent}");
            }

            JsonSerializerOptions jsonOptions = new() { PropertyNameCaseInsensitive = true };

            return JsonSerializer.Deserialize<T>(responseContent, jsonOptions);
        }
        #endregion

        public async Task FunctionRenew()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;
            string selectedFunction = cmbFunctions.Text;
            string sqlFunction = femsql.Text;

            if (!ConfirmProd(cText))
            {
                return;
            }

            string apiBaseUrl = GetApiBaseUrl(cText);
            string url = $"{apiBaseUrl}/master/set-total-function";

            Operation = $"Set Function - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;
            errors.ItemsSource = ErrorListe;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
            RaisePropertyChanged(nameof(ErrorListe));

            int successCount = 0;
            int errorCount = 0;

            ResetStatus($"{operationName} - Başladı");

            List<PackTarget> targets = await GetPackTargetsAsync(apiBaseUrl);

            if (!targets.Any())
            {
                Liste.Add("         işlenecek veritabanı bulunamadı - Start kutusunu kontrol edin (0 = Dbt_Temp)");
                RaisePropertyChanged(nameof(Liste));

                SetStatus($"{operationName} - işlenecek veritabanı bulunamadı", true, true);

                return;
            }

            QueuedCount = targets.Count;

            async Task UpdateOperationAsync(string text)
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    _operation = text;
                    RaisePropertyChanged(nameof(Operation));
                });
            }

            async Task AddSuccessAsync(string message)
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    Liste.Add(message);
                    list.ItemsSource = Liste;
                    RaisePropertyChanged(nameof(Liste));
                    _operation = $"{operationName} - Devam ediyor | Başarılı: {Volatile.Read(ref successCount)} | Hatalı: {Volatile.Read(ref errorCount)}";
                    RaisePropertyChanged(nameof(Operation));

                    SuccessCount = Volatile.Read(ref successCount);
                    PendingCount = targets.Count - SuccessCount - ErrorCount;
                    SetStatus($"{operationName} - Devam ediyor", false, ErrorCount > 0);

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);
                });
            }

            async Task AddErrorAsync(string message)
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    ErrorListe.Add(message);
                    errors.ItemsSource = ErrorListe;
                    RaisePropertyChanged(nameof(ErrorListe));
                    _operation = $"{operationName} - Devam ediyor | Başarılı: {Volatile.Read(ref successCount)} | Hatalı: {Volatile.Read(ref errorCount)}";
                    RaisePropertyChanged(nameof(Operation));

                    ErrorCount = Volatile.Read(ref errorCount);
                    PendingCount = targets.Count - SuccessCount - ErrorCount;
                    SetStatus($"{operationName} - Devam ediyor", false, true);

                    errors.SelectedIndex = errors.Items.Count - 1;
                    errors.ScrollIntoView(errors.SelectedItem);
                });
            }

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            await Parallel.ForEachAsync(targets, new ParallelOptions
            {
                MaxDegreeOfParallelism = 6
            }, async (target, cancellationToken) =>
            {
                string url1 = !string.IsNullOrWhiteSpace(selectedFunction)
                    ? $"{url}/{target.PackNo}/{selectedFunction}"
                    : $"{url}/{target.PackNo}/{sqlFunction}";

                await UpdateOperationAsync($"{operationName} - Çalışıyor: {url1} | Başarılı: {Volatile.Read(ref successCount)} | Hatalı: {Volatile.Read(ref errorCount)}");

                HttpResponseMessage response = null;

                try
                {
                    response = await client.GetAsync(url1, cancellationToken);
                    var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        Interlocked.Increment(ref successCount);
                        await AddSuccessAsync($"{target.DisplayName} --> {responseContent}");
                    }
                    else
                    {
                        string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                        Interlocked.Increment(ref errorCount);
                        await AddErrorAsync($"{target.DisplayName} - Status Code: {response.StatusCode} -- {error}");
                    }
                }
                catch (Exception exx)
                {
                    string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;
                    Interlocked.Increment(ref errorCount);
                    await AddErrorAsync($"{target.DisplayName} - Status Code: {response?.StatusCode} -- {error}");
                }
            });

            await Dispatcher.InvokeAsync(() =>
            {
                Liste.Add("         *********************      ");
                Liste.Add($"              Tamamlandı - Başarılı: {successCount} - Hatalı: {errorCount}");
                Liste.Add("         *********************      ");
                Liste.Add("         ");
                Liste.Add("         ");
                list.SelectedIndex = list.Items.Count - 1;
                list.ScrollIntoView(list.SelectedItem);
                RaisePropertyChanged(nameof(Liste));

                PendingCount = 0;
                SetStatus($"{operationName} - {FinishedPhase}", true, errorCount > 0);
            });

            await UpdateOperationAsync($"{operationName} - Tamamlandı | Başarılı: {successCount} | Hatalı: {errorCount}");
        }

        /// <summary>
        /// EF migration'larını (ve onlara bağlı, henüz uygulanmamış Dbt migration'larını) sunucuda
        /// Hangfire kuyruğunda koşturur (migrate-bg) ve durumunu izler. Sunucu tarafındaki mantık
        /// senkron <c>migrate</c> ucuyla aynı; yalnız istek beklemez.
        /// Start ile başlayan paketler; End boşsa prefix modu, Start 0 ise Dbt_Temp.
        /// </summary>
        public async Task Migrate()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;

            if (!ConfirmProd(cText))
            {
                return;
            }

            string apiBaseUrl = GetApiBaseUrl(cText);

            Operation = $"Migration (kuyruk) - {apiBaseUrl}/master/migrate-bg";

            List<PackTarget> targets = await GetPackTargetsAsync(apiBaseUrl);

            // Aralık modu: paket başına iş açmak yerine tüm aralık için tek sıralı iş.
            PackTarget rangeTarget = GetRangeTarget(targets);

            if (rangeTarget != null)
            {
                string rangeUrl = $"{apiBaseUrl}/master/migrate-between-bg/{rangeTarget.PackNo}/{rangeTarget.PackNoEnding}";

                await RunQueuedOperationAsync(
                    operationName,
                    $"{apiBaseUrl}/master/migrate-between-bg",
                    apiBaseUrl,
                    new List<PackTarget> { rangeTarget },
                    target => rangeUrl);

                return;
            }

            await RunQueuedOperationAsync(
                operationName,
                $"{apiBaseUrl}/master/migrate-bg",
                apiBaseUrl,
                targets,
                target => $"{apiBaseUrl}/master/migrate-bg/{target.PackNo}");
        }

        public async Task UpdateSalerIds()
        {
            MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
            if (messageBoxResult == MessageBoxResult.No)
            {
                return;
            }

            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;

            string apiBaseUrl = GetApiBaseUrl(cText);
            string url = $"{apiBaseUrl}/dbtRenewal/updateSalerPackCompanies";

            ResetStatus($"{operationName} - Başladı");

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            List<PackTarget> targets = await GetPackTargetsAsync(apiBaseUrl);

            if (!targets.Any())
            {
                Liste.Add("         işlenecek veritabanı bulunamadı - Start kutusunu kontrol edin (0 = Dbt_Temp)");
                RaisePropertyChanged(nameof(Liste));

                SetStatus($"{operationName} - işlenecek veritabanı bulunamadı", true, true);

                return;
            }

            QueuedCount = targets.Count;
            PendingCount = targets.Count;

            foreach (PackTarget target in targets)
            {
                string i = target.DisplayName;

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                client.DefaultRequestHeaders.ConnectionClose = false;


                string url1 = $"{url}/{target.PackNo}/{docStartDate.Text}/{docEndDate.Text}";

                // Operation property'sinin setter'ı ErrorListe'yi sıfırlıyor; döngü içinde onu kullanmak
                // hatalı listesini her turda siliyordu.
                _operation = $"{operationName} - {url1}";
                RaisePropertyChanged(nameof(Operation));

                SetStatus($"{operationName} - Devam ediyor ({i})", false, ErrorCount > 0);

                HttpResponseMessage response = null;

                try
                {
                    response = await client.GetAsync(url1);

                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        var responseContent = await response.Content.ReadAsStringAsync();

                        if (!string.IsNullOrWhiteSpace(responseContent) && responseContent.Contains($"\"isOk\": true,"))
                        {
                            Liste.Add($"{i} - ok - {DateTime.Now.ToString()}");

                            list.ItemsSource = Liste;

                            RaisePropertyChanged(nameof(Liste));

                            list.SelectedIndex = list.Items.Count - 1;
                            list.ScrollIntoView(list.SelectedItem);

                            ++SuccessCount;

                            await Task.Delay(500);
                        }
                        else
                        {
                            string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                            ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                            errors.ItemsSource = ErrorListe;

                            RaisePropertyChanged(nameof(ErrorListe));

                            ++ErrorCount;

                            await Task.Delay(500);
                        }
                    }
                    else
                    {
                        var responseContent = await response.Content.ReadAsStringAsync();

                        string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                        ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                        errors.ItemsSource = ErrorListe;

                        RaisePropertyChanged(nameof(ErrorListe));

                        ++ErrorCount;

                        await Task.Delay(500);
                    }
                }
                catch (Exception exx)
                {
                    var responseContent = (response != null && response.Content != null) ? await response.Content.ReadAsStringAsync() : "";

                    string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;
                    ErrorListe.Add($"{i} - Status Code: {response?.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    errors.ItemsSource = ErrorListe;

                    ++ErrorCount;

                    await Task.Delay(500);

                }

                PendingCount = targets.Count - SuccessCount - ErrorCount;

                client.Dispose();
            }
            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            PendingCount = 0;
            SetStatus($"{operationName} - {FinishedPhase}", true, ErrorCount > 0);
        }


        private async void PrintReset_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/dbtreport/reset-print-all/";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/dbtreport/reset-print-all/";
                //url = @$"https://test.unideva.com/svc/api/master/dbt-rpt-migrate-all/<i>/{urlValue.Text}";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/dbtreport/reset-print-all/";
                //url = @$"https://preprod.unideva.com/svc/api/master/dbt-rpt-migrate-all/<i>/{urlValue.Text}";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/dbtreport/reset-print-all/";
                //url = @$"https://hw.unideva.com/svc/api/master/dbt-rpt-migrate-all/<i>/{urlValue.Text}";
            }

            Operation = $"Print Reset - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            for (int i = start; i < end; i++)
            {
                if (DatNames != null && DatNames.Any())
                {
                    var index = DatNames.IndexOf($"Dbt_{i}");
                    if (index < 0)
                    {
                        continue;
                    }
                }

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                client.DefaultRequestHeaders.Add("Keep-Alive", "600");

                string url1 = $"{url}/{i}"; // url.Replace("<i>", i.ToString());

                var response = await client.GetAsync(url1);

                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    Liste.Add(responseContent);

                    list.ItemsSource = Liste;

                    RaisePropertyChanged(nameof(Liste));

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);


                    await Task.Delay(500);

                }
                else
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                    ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    await Task.Delay(500);
                }

                client.Dispose();
            }
            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
        }


        private async void GetMigrationId_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/get-migration-id/";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-migration-id/";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-migration-id/";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/get-migration-id/";
            }

            Operation = $"Get Migration Id - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            errors.ItemsSource = ErrorListe;

            for (int i = start; i < end; i++)
            {
                if (DatNames != null && DatNames.Any())
                {
                    var index = DatNames.IndexOf($"Dbt_{i}");
                    if (index < 0)
                    {
                        continue;
                    }
                }

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                client.DefaultRequestHeaders.Add("Keep-Alive", "600");

                string url1 = $"{url}/{i}";

                var response = await client.GetAsync(url1);

                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    if (!string.IsNullOrWhiteSpace(urlValue.Text))
                    {
                        if (responseContent.Contains(urlValue.Text))
                        {
                            Liste.Add(responseContent);

                            list.ItemsSource = Liste;

                            RaisePropertyChanged(nameof(Liste));

                            list.SelectedIndex = list.Items.Count - 1;
                            list.ScrollIntoView(list.SelectedItem);

                        }
                        else
                        {
                            ErrorListe.Add(responseContent);
                            RaisePropertyChanged(nameof(ErrorListe));

                            await Task.Delay(500);
                        }
                    }
                    else
                    {
                        Liste.Add(responseContent);

                        list.ItemsSource = Liste;

                        RaisePropertyChanged(nameof(Liste));

                        list.SelectedIndex = list.Items.Count - 1;
                        list.ScrollIntoView(list.SelectedItem);
                    }

                    await Task.Delay(500);

                }
                else
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                    ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    await Task.Delay(500);
                }

                client.Dispose();
            }
            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
        }

        private async void GetMigrations_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/master/get-migrations";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/get-migrations";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-migrations";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-migrations";
            }
            else if (cText == "Prod")
            {
                url = $@"https://hw.unideva.com/svc/api/master/get-migrations";
            }

            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            string url1 = $"{url}";

            var response = await client.GetAsync(url1);

            if (response.StatusCode == HttpStatusCode.OK)
            {
                Liste = new();
                var responseContent = await response.Content.ReadAsStringAsync();

                var migs = JsonSerializer.Deserialize<List<string>>(responseContent);
                if (migs.Any())
                {
                    Migrations = new ObservableCollection<string>(migs);
                    Liste.Add("Migrations ok");
                }
                else
                {
                    Migrations = new ObservableCollection<string>();
                    Liste.Add("Migrations not reading !..");
                    Liste.Add(responseContent);
                }

                urlValue.ItemsSource = Migrations;

                list.ItemsSource = Liste;

                RaisePropertyChanged(nameof(Liste));

                list.SelectedIndex = list.Items.Count - 1;
                list.ScrollIntoView(list.SelectedItem);

                await Task.Delay(1000);
            }
            else
            {
                Migrations = new ObservableCollection<string>();

                urlValue.ItemsSource = Migrations;

                Liste = new();
                ErrorListe = new();
                var responseContent = await response.Content.ReadAsStringAsync();
                string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                ErrorListe.Add($"{error}");
                RaisePropertyChanged(nameof(ErrorListe));

                if (!string.IsNullOrEmpty(error))
                {
                    Liste.Clear();
                    Liste.Add(error);

                    list.ItemsSource = Liste;

                    RaisePropertyChanged(nameof(Liste));

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);
                }
                await Task.Delay(1500);
            }

            client.Dispose();
        }

        private async void GetDbtMigrations_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/master/get-dbt-migrations";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/get-dbt-migrations";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-dbt-migrations";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-dbt-migrations";
            }
            else if (cText == "Prod")
            {
                url = $@"https://hw.unideva.com/svc/api/master/get-dbt-migrations";
            }

            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            string url1 = $"{url}";

            var response = await client.GetAsync(url1);

            if (response.StatusCode == HttpStatusCode.OK)
            {
                Liste = new();
                var responseContent = await response.Content.ReadAsStringAsync();

                var migs = JsonSerializer.Deserialize<List<string>>(responseContent);
                if (migs != null && migs.Any())
                {
                    DbtMigrations = new ObservableCollection<string>(migs);
                    cmbDbtMigrate.ItemsSource = DbtMigrations;

                    // Liste zaman damgalı id'ler yeniden eskiye gelir; en güncel migration hazır seçili olur.
                    cmbDbtMigrate.SelectedIndex = 0;

                    Liste.Add($"Dbt Migrations ok - {DbtMigrations.Count} adet (seçili: {cmbDbtMigrate.Text})");
                }
                else
                {
                    DbtMigrations = new ObservableCollection<string>();
                    cmbDbtMigrate.ItemsSource = DbtMigrations;

                    Liste.Add("Dbt Migrations not reading !..");
                    Liste.Add(responseContent);
                }

                list.ItemsSource = Liste;

                RaisePropertyChanged(nameof(Liste));

                list.SelectedIndex = list.Items.Count - 1;
                list.ScrollIntoView(list.SelectedItem);

                await Task.Delay(1000);
            }
            else
            {
                Migrations = new ObservableCollection<string>();

                cmbDbtMigrate.ItemsSource = DbtMigrations;

                Liste = new();
                ErrorListe = new();
                var responseContent = await response.Content.ReadAsStringAsync();
                string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                ErrorListe.Add($"{error}");
                RaisePropertyChanged(nameof(ErrorListe));

                if (!string.IsNullOrEmpty(error))
                {
                    Liste.Clear();
                    Liste.Add(error);

                    list.ItemsSource = Liste;

                    RaisePropertyChanged(nameof(Liste));

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);
                }
                await Task.Delay(1500);
            }

            client.Dispose();
        }

        private async void GetDatNames_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/master/get-dbtdatnames/{tbstart.Text}";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/get-dbtdatnames/{tbstart.Text}";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-dbtdatnames/{tbstart.Text}";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-dbtdatnames/{tbstart.Text}";
            }
            else if (cText == "Prod")
            {
                url = $@"https://hw.unideva.com/svc/api/master/get-dbtdatnames/{tbstart.Text}";
            }

            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            string url1 = $"{url}";

            var response = await client.GetAsync(url1);

            if (response.StatusCode == HttpStatusCode.OK)
            {
                Liste = new();
                var responseContent = await response.Content.ReadAsStringAsync();

                var migs = JsonSerializer.Deserialize<List<string>>(responseContent);
                if (migs.Any())
                {
                    DatNames = migs;
                    Liste.Add("DatNames ok");

                    string min = migs.OrderBy(d => d).FirstOrDefault();
                    string max = migs.OrderByDescending(d => d).FirstOrDefault();

                    Liste.Add($" Min : {min}");
                    Liste.Add($" Max : {max}");
                    Liste.Add($"Count : {migs.Count}");

                    tbstart.Text = min.Replace("Dbt_", "");
                    tbend.Text = max.Replace("Dbt_", "");

                }
                else
                {
                    Liste.Add("datNames not reading !..");
                    Liste.Add(responseContent);
                }

                list.ItemsSource = Liste;

                RaisePropertyChanged(nameof(Liste));

                list.SelectedIndex = list.Items.Count - 1;
                list.ScrollIntoView(list.SelectedItem);

                await Task.Delay(1000);
            }
            else
            {
                Liste = new();
                ErrorListe = new();
                var responseContent = await response.Content.ReadAsStringAsync();
                string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                ErrorListe.Add($"{error}");
                RaisePropertyChanged(nameof(ErrorListe));

                if (!string.IsNullOrEmpty(error))
                {
                    Liste.Clear();
                    Liste.Add(error);

                    list.ItemsSource = Liste;

                    RaisePropertyChanged(nameof(Liste));

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);
                }
                await Task.Delay(1500);
            }

            client.Dispose();
        }

        private async void TestButton_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/test";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/test";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/test";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/test";
            }
            else if (cText == "Prod")
            {
                url = $@"https://hw.unideva.com/svc/api/test";
            }

            Operation = $"Test - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            var response = await client.GetAsync(url);

            if (response.StatusCode == HttpStatusCode.OK)
            {
                var responseContent = await response.Content.ReadAsStringAsync();

                Liste.Add($"{responseContent} - {DateTime.Now.ToString()}");

                list.ItemsSource = Liste;

                RaisePropertyChanged(nameof(Liste));

                list.SelectedIndex = list.Items.Count - 1;
                list.ScrollIntoView(list.SelectedItem);


                await Task.Delay(1000);

            }
            else
            {
                var responseContent = await response.Content.ReadAsStringAsync();

                string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                ErrorListe.Add($"Status Code: {response.StatusCode} -- {error}");

                RaisePropertyChanged(nameof(ErrorListe));

                await Task.Delay(15000);
            }

            client.Dispose();

            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
        }

        private async void CheckMigrationId_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/get-not-include-mig-packs";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-not-include-mig-packs";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-not-include-mig-packs";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/get-not-include-mig-packs";
            }

            Operation = $"Check Migration Id - {url}";

            ErrorListe = new ObservableCollection<string>();

            var mig = SelectedMigration != null ? SelectedMigration : urlValue.Text;

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}/{tbstart.Text}/{mig}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            errors.ItemsSource = ErrorListe;
            RaisePropertyChanged(nameof(ErrorListe));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            for (int i = start; i <= end; i++)
            {
                if (DatNames != null && DatNames.Any())
                {
                    var index = DatNames.IndexOf($"Dbt_{i}");
                    if (index < 0)
                    {
                        continue;
                    }
                }

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                client.DefaultRequestHeaders.Add("Keep-Alive", "600");

                string url1 = $"{url}/{i}/{mig}";

                //string url1 = $"{url}/{i}"; // url.Replace("<i>", i.ToString());

                var response = await client.GetAsync(url1);

                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    if (responseContent.Contains("not include"))
                    {
                        string error = responseContent;
                        ErrorListe.Add(error);
                        RaisePropertyChanged(nameof(ErrorListe));
                        await Task.Delay(250);
                    }
                    else
                    {
                        Liste.Add(responseContent);

                        list.ItemsSource = Liste;

                        RaisePropertyChanged(nameof(Liste));

                        list.SelectedIndex = list.Items.Count - 1;
                        list.ScrollIntoView(list.SelectedItem);


                        await Task.Delay(250);
                    }
                }
                else
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                    ErrorListe.Add($"Status Code: {response.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    await Task.Delay(250);
                }

                client.Dispose();

            }

            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            errors.ItemsSource = ErrorListe;
            RaisePropertyChanged(nameof(ErrorListe));
        }

        private void errors_MouseDoubleClick(object sender, MouseButtonEventArgs e)
        {
            if (errors.SelectedItem != null)
            {
                //ShowDialog.Show(errors.SelectedItem.ToString());
            }
        }

        private async void ExequteRunQl_Click(object sender, RoutedEventArgs e)
        {
            string cText = cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            if (string.IsNullOrWhiteSpace(femsql.Text)) { return; }

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/migration/fems-ql";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/migration/fems-ql";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/migration/fems-ql";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/migration/fems-ql";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/migration/fems-ql";
            }

            Operation = $"Migration - {url} / {femsql.Text}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            for (int i = start; i <= end; i++)
            {
                if (DatNames != null && DatNames.Any())
                {
                    var index = DatNames.IndexOf($"Dbt_{i}");
                    if (index < 0)
                    {
                        continue;
                    }
                }

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                client.DefaultRequestHeaders.Add("Keep-Alive", "true");
                client.DefaultRequestHeaders.ConnectionClose = false;

                string url1 = $"{url}/{femsql.Text}/{i}"; // url.Replace("<i>", i.ToString());

                var response = await client.GetAsync(url1);

                try
                {
                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        var responseContent = await response.Content.ReadAsStringAsync();

                        Liste.Add($"Dbt_{i} - {responseContent} - {DateTime.Now.ToString()}");

                        list.ItemsSource = Liste;

                        RaisePropertyChanged(nameof(Liste));

                        list.SelectedIndex = list.Items.Count - 1;
                        list.ScrollIntoView(list.SelectedItem);


                        await Task.Delay(500);

                    }
                    else
                    {
                        var responseContent = await response.Content.ReadAsStringAsync();

                        string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                        ErrorListe.Add($"Dbt_{i} - Status Code: {response.StatusCode} -- {error}");

                        errors.ItemsSource = ErrorListe;

                        RaisePropertyChanged(nameof(ErrorListe));

                        await Task.Delay(500);
                    }
                }
                catch (Exception exx)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;
                    ErrorListe.Add($"Dbt_{i} - Status Code: {response.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    errors.ItemsSource = ErrorListe;

                    await Task.Delay(500);

                }


                client.Dispose();
            }
            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
        }

        private async void CleanUblInfo_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/check-etr-ubl-infos";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/check-etr-ubl-infos";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/check-etr-ubl-infos";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/check-etr-ubl-infos";
            }

            Operation = $"Check UBL Infos - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            for (int i = start; i < end; i++)
            {
                if (DatNames != null && DatNames.Any())
                {
                    var index = DatNames.IndexOf($"Dbt_{i}");
                    if (index < 0)
                    {
                        continue;
                    }
                }

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                client.DefaultRequestHeaders.Add("Keep-Alive", "600");

                string url1 = $"{url}/{i}/{femsql.Text}";

                Operation = url1;

                var response = await client.GetAsync(url1);

                if (response.StatusCode == HttpStatusCode.OK)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    Liste.Add(responseContent);

                    list.ItemsSource = Liste;

                    RaisePropertyChanged(nameof(Liste));

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);

                    await Task.Delay(500);

                }
                else
                {
                    var responseContent = await response.Content.ReadAsStringAsync();

                    string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                    ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    await Task.Delay(500);
                }

                client.Dispose();
            }
            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
        }

        private async void GetFuncNames_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/get-res-functions";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-res-functions";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/get-res-functions";
            }
            else if (cText == "Prod")
            {
                url = $@"https://hw.unideva.com/svc/api/master/get-res-functions";
            }

            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            var response = await client.GetAsync(url);

            if (response.StatusCode == HttpStatusCode.OK)
            {
                Liste = new();
                var responseContent = await response.Content.ReadAsStringAsync();

                var resFiles = JsonSerializer.Deserialize<List<string>>(responseContent);

                urlValue.ItemsSource = resFiles;


                await Task.Delay(1000);
            }
            else
            {

                urlValue.ItemsSource = new List<string>();

            }

            client.Dispose();
        }

        private async void UpdateCompanies_Click(object sender, RoutedEventArgs e)
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            int pk = 1;

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/master/updatePackCompanies";
                pk = 1;
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/updatePackCompanies";
                pk = 1;
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/updatePackCompanies";
                pk = 2;
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/updatePackCompanies";
                pk = 2;
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/updatePackCompanies";
                pk = 3;
            }

            Operation = $"Update_companies - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            for (int i = start; i <= end; i++)
            {
                if (DatNames != null && DatNames.Any())
                {
                    var index = DatNames.IndexOf($"Dbt_{i}");
                    if (index < 0)
                    {
                        continue;
                    }
                }

                var client = new HttpClient();
                client.DefaultRequestHeaders.Add("Connection", "keep-alive");
                //client.DefaultRequestHeaders.Add("Keep-Alive", "true");
                client.DefaultRequestHeaders.ConnectionClose = false;

                string url1 = $"{url}/{i}/{pk}"; // url.Replace("<i>", i.ToString());

                HttpResponseMessage response = null;

                try
                {
                    response = await client.GetAsync(url1);

                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        var responseContent = await response.Content.ReadAsStringAsync();

                        Liste.Add($"{i} - {responseContent} - {DateTime.Now.ToString()}");

                        list.ItemsSource = Liste;

                        RaisePropertyChanged(nameof(Liste));

                        list.SelectedIndex = list.Items.Count - 1;
                        list.ScrollIntoView(list.SelectedItem);


                        await Task.Delay(500);

                    }
                    else
                    {
                        var responseContent = await response.Content.ReadAsStringAsync();

                        string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                        ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                        errors.ItemsSource = ErrorListe;

                        RaisePropertyChanged(nameof(ErrorListe));

                        await Task.Delay(500);
                    }
                }
                catch (Exception exx)
                {
                    var responseContent = (response != null && response.Content != null) ? await response.Content.ReadAsStringAsync() : "";

                    string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;
                    ErrorListe.Add($"{i} - Status Code: {response?.StatusCode} -- {error}");

                    RaisePropertyChanged(nameof(ErrorListe));

                    errors.ItemsSource = ErrorListe;

                    await Task.Delay(500);

                }


                client.Dispose();
            }
            Liste.Add("         *********************      ");
            Liste.Add("              Tamamlandı");
            Liste.Add("         *********************      ");
            Liste.Add("         ");
            Liste.Add("         ");
            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
        }

        private void cmbOperation_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            dbtFuncRenewGrid.Visibility = cmbOperation.SelectedIndex == 2 ? Visibility.Visible : Visibility.Collapsed;

            // Migration adı hem "1-Dbt-Migrate" hem "8-Migration Takip" için gerekiyor (takip, tek bir
            // migration'ın paket paket durumunu sorar); "Yalnız eksik" seçeneği yalnız takipte anlamlı.
            dbtMigrateGrid.Visibility = cmbOperation.SelectedIndex == 1 || cmbOperation.SelectedIndex == 8
                ? Visibility.Visible
                : Visibility.Collapsed;

            chkOnlyMissing.Visibility = cmbOperation.SelectedIndex == 8 ? Visibility.Visible : Visibility.Collapsed;

            grdUpdateSalerId.Visibility = cmbOperation.SelectedIndex == 6 ? Visibility.Visible : Visibility.Collapsed;
        }

        private async void RunOperation_Click(object sender, RoutedEventArgs e)
        {
            if (cmbOperation.SelectedIndex == 0)
            {
                await Migrate();
            }
            else if (cmbOperation.SelectedIndex == 1)
            {
                await DbtMigrate();
            }
            else if (cmbOperation.SelectedIndex == 2)
            {
                await FunctionRenew();
            }
            else if (cmbOperation.SelectedIndex == 3)
            {
                
            }
            else if (cmbOperation.SelectedIndex == 4)
            {
                
            }
            else if (cmbOperation.SelectedIndex == 5)
            {
                
            }
            else if (cmbOperation.SelectedIndex == 6)
            {
                await UpdateSalerIds();
            }
            else if (cmbOperation.SelectedIndex == 7)
            {
                await MigrationHistory();
            }
            else if (cmbOperation.SelectedIndex == 8)
            {
                await MigrationPacks();
            }
        }
    }
}
