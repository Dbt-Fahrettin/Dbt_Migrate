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
        public int ListNo { get; set; }
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

        private void Goster_Error_Click(object sender, RoutedEventArgs e)
        {
            if (ListNo == 0)
            {
                list.ItemsSource = ErrorListe;
                ListNo = 1;
                RaisePropertyChanged(nameof(ErrorListe));
            }
            else
            {
                list.ItemsSource = Liste;
                ListNo = 0;
                RaisePropertyChanged(nameof(Liste));
            }
        }

        public async Task DbtMigrate()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;
            string dbtMigrationName = cmbDbtMigrate.Text;

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/master/dbt-migrate-all/";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/dbt-migrate-all/";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/dbt-migrate-all/";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/dbt-migrate-all/";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/dbt-migrate-all/";
            }

            Operation = $"Dbt-Migration - {url}";

            ErrorListe = new ObservableCollection<string>();

            Liste = new ObservableCollection<string>();
            Liste.Add("         *********************      ");
            Liste.Add($"              Başladı - {url}-{urlValue.Text}");
            Liste.Add("         *********************      ");
            list.ItemsSource = Liste;
            errors.ItemsSource = ErrorListe;

            list.SelectedIndex = list.Items.Count - 1;
            list.ScrollIntoView(list.SelectedItem);
            RaisePropertyChanged(nameof(Liste));
            RaisePropertyChanged(nameof(ErrorListe));

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            int successCount = 0;
            int errorCount = 0;

            var indexes = Enumerable.Range(start, end - start)
                .Where(i => DatNames == null || !DatNames.Any() || DatNames.Contains($"Dbt_{i}"))
                .ToList();

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

                    list.SelectedIndex = list.Items.Count - 1;
                    list.ScrollIntoView(list.SelectedItem);
                });
            }

            async Task AddErrorAsync(string errorMessage, string? listMessage = null)
            {
                await Dispatcher.InvokeAsync(() =>
                {
                    if (!string.IsNullOrWhiteSpace(listMessage))
                    {
                        Liste.Add(listMessage);
                        list.ItemsSource = Liste;
                        RaisePropertyChanged(nameof(Liste));

                        list.SelectedIndex = list.Items.Count - 1;
                        list.ScrollIntoView(list.SelectedItem);
                    }

                    ErrorListe.Add(errorMessage);
                    errors.ItemsSource = ErrorListe;
                    RaisePropertyChanged(nameof(ErrorListe));
                    _operation = $"{operationName} - Devam ediyor | Başarılı: {Volatile.Read(ref successCount)} | Hatalı: {Volatile.Read(ref errorCount)}";
                    RaisePropertyChanged(nameof(Operation));

                    errors.SelectedIndex = errors.Items.Count - 1;
                    errors.ScrollIntoView(errors.SelectedItem);
                });
            }

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            await Parallel.ForEachAsync(indexes, new ParallelOptions
            {
                MaxDegreeOfParallelism = 6
            }, async (i, cancellationToken) =>
            {
                string url1 = $"{url}{i}/{dbtMigrationName}";

                await UpdateOperationAsync($"{operationName} - Çalışıyor: {url1} | Başarılı: {Volatile.Read(ref successCount)} | Hatalı: {Volatile.Read(ref errorCount)}");

                HttpResponseMessage response = null;

                try
                {
                    response = await client.GetAsync(url1, cancellationToken);
                    var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        Interlocked.Increment(ref successCount);
                        await AddSuccessAsync($"{i} --> {responseContent}");
                    }
                    else
                    {
                        string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                        Interlocked.Increment(ref errorCount);
                        await AddErrorAsync($"{i} - Status Code: {response.StatusCode} -- {error}", $"{i} --> error");
                    }
                }
                catch (Exception exx)
                {
                    string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;
                    Interlocked.Increment(ref errorCount);
                    await AddErrorAsync($"{i} - Status Code: {response?.StatusCode} -- {error}", $"{i} --> error");
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
            });

            await UpdateOperationAsync($"{operationName} - Tamamlandı | Başarılı: {successCount} | Hatalı: {errorCount}");
        }

        public async Task FunctionRenew()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;
            string selectedFunction = cmbFunctions.Text;
            string sqlFunction = femsql.Text;

            string url = "";

            if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/set-total-function";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/set-total-function";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/set-total-function";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/set-total-function";
            }

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

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            int successCount = 0;
            int errorCount = 0;

            var indexes = Enumerable.Range(start, end - start)
                .Where(i => DatNames == null || !DatNames.Any() || DatNames.Contains($"Dbt_{i}"))
                .ToList();

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

                    errors.SelectedIndex = errors.Items.Count - 1;
                    errors.ScrollIntoView(errors.SelectedItem);
                });
            }

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.Add("Keep-Alive", "600");

            await Parallel.ForEachAsync(indexes, new ParallelOptions
            {
                MaxDegreeOfParallelism = 6
            }, async (i, cancellationToken) =>
            {
                string url1 = !string.IsNullOrWhiteSpace(selectedFunction)
                    ? $"{url}/{i}/{selectedFunction}"
                    : $"{url}/{i}/{sqlFunction}";

                await UpdateOperationAsync($"{operationName} - Çalışıyor: {url1} | Başarılı: {Volatile.Read(ref successCount)} | Hatalı: {Volatile.Read(ref errorCount)}");

                HttpResponseMessage response = null;

                try
                {
                    response = await client.GetAsync(url1, cancellationToken);
                    var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        Interlocked.Increment(ref successCount);
                        await AddSuccessAsync(responseContent);
                    }
                    else
                    {
                        string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                        Interlocked.Increment(ref errorCount);
                        await AddErrorAsync($"{i} - Status Code: {response.StatusCode} -- {error}");
                    }
                }
                catch (Exception exx)
                {
                    string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;
                    Interlocked.Increment(ref errorCount);
                    await AddErrorAsync($"{i} - Status Code: {response?.StatusCode} -- {error}");
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
            });

            await UpdateOperationAsync($"{operationName} - Tamamlandı | Başarılı: {successCount} | Hatalı: {errorCount}");
        }

        public async Task Migrate()
        {
            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();
            string operationName = cmbOperation.Text;

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/master/migrate/";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/master/migrate/";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/master/migrate/";
                //url = @$"https://test.unideva.com/svc/api/master/dbt-rpt-migrate-all/<i>/{urlValue.Text}";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/master/migrate/";
                //url = @$"https://preprod.unideva.com/svc/api/master/dbt-rpt-migrate-all/<i>/{urlValue.Text}";
            }
            else if (cText == "Prod")
            {
                MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
                if (messageBoxResult == MessageBoxResult.No)
                {
                    return;
                }

                url = $@"https://hw.unideva.com/svc/api/master/migrate-all/";
                //url = @$"https://hw.unideva.com/svc/api/master/dbt-rpt-migrate-all/<i>/{urlValue.Text}";
            }

            Operation = $"Migration - {url}";

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

            int start = int.Parse(tbstart.Text);
            int end = int.Parse(tbend.Text) + 1;

            int successCount = 0;
            int errorCount = 0;

            var indexes = Enumerable.Range(start, (end - start) + 1)
                .Where(i => DatNames == null || !DatNames.Any() || DatNames.Contains($"Dbt_{i}"))
                .ToList();

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

                    errors.SelectedIndex = errors.Items.Count - 1;
                    errors.ScrollIntoView(errors.SelectedItem);
                });
            }

            using var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Connection", "keep-alive");
            client.DefaultRequestHeaders.ConnectionClose = false;

            await Parallel.ForEachAsync(indexes, new ParallelOptions
            {
                MaxDegreeOfParallelism = 6
            }, async (i, cancellationToken) =>
            {
                string url1 = $"{url}/{i}";

                await UpdateOperationAsync($"{operationName} - Çalışıyor: {url1} | Başarılı: {Volatile.Read(ref successCount)} | Hatalı: {Volatile.Read(ref errorCount)}");

                HttpResponseMessage response = null;

                try
                {
                    response = await client.GetAsync(url1, cancellationToken);
                    var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);

                    if (response.StatusCode == HttpStatusCode.OK)
                    {
                        Interlocked.Increment(ref successCount);
                        await AddSuccessAsync($"{i} - {responseContent} - {DateTime.Now}");
                    }
                    else
                    {
                        string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                        Interlocked.Increment(ref errorCount);
                        await AddErrorAsync($"{i} - Status Code: {response.StatusCode} -- {error}");
                    }
                }
                catch (Exception exx)
                {
                    string error = exx.InnerException != null ? $"{exx.Message} - {exx.InnerException.Message}" : exx.Message;
                    Interlocked.Increment(ref errorCount);
                    await AddErrorAsync($"{i} - Status Code: {response?.StatusCode} -- {error}");
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
            });

            await UpdateOperationAsync($"{operationName} - Tamamlandı | Başarılı: {successCount} | Hatalı: {errorCount}");
        }

        public async Task UpdateSalerIds()
        {
            MessageBoxResult messageBoxResult = System.Windows.MessageBox.Show("Are you sure?", "Confirmation", System.Windows.MessageBoxButton.YesNo, MessageBoxImage.Question, MessageBoxResult.No);
            if (messageBoxResult == MessageBoxResult.No)
            {
                return;
            }

            string cText = ((ComboBoxItem)cmbServis.SelectedItem).Content.ToString();

            string url = "";

            if (cText == "Local")
            {
                url = @$"http://localhost:44305/api/dbtRenewal/updateSalerPackCompanies";
            }
            else if (cText == "Pre Test")
            {
                url = @$"http://devatek.deva.zone/svc/api/dbtRenewal/updateSalerPackCompanies";
            }
            else if (cText == "Test")
            {
                url = $@"https://test.unideva.com/svc/api/dbtRenewal/updateSalerPackCompanies";
            }
            else if (cText == "PreProd")
            {
                url = $@"https://test.unideva.com/svc/api/dbtRenewal/updateSalerPackCompanies";
            }
            else if (cText == "Prod")
            {
                url = $@"https://hw.unideva.com/svc/api//dbtRenewal/updateSalerPackCompanies";
            }
                       

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
                client.DefaultRequestHeaders.ConnectionClose = false;


                string url1 = $"{url}/{i}/{docStartDate.Text}/{docEndDate.Text}";

                Operation = $"{cmbOperation.Text} - {url1}";

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


                            await Task.Delay(500);
                        }
                        else
                        {
                            string error = !string.IsNullOrWhiteSpace(responseContent) ? responseContent : "";
                            ErrorListe.Add($"{i} - Status Code: {response.StatusCode} -- {error}");

                            errors.ItemsSource = ErrorListe;

                            RaisePropertyChanged(nameof(ErrorListe));

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
                if (migs.Any())
                {
                    DbtMigrations = new ObservableCollection<string>(migs);
                    Liste.Add("Dbt Migrations ok");
                }
                else
                {
                    DbtMigrations = new ObservableCollection<string>();
                    Liste.Add("Dbt Migrations not reading !..");
                    Liste.Add(responseContent);
                }

                cmbDbtMigrate.ItemsSource = DbtMigrations;

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
            dbtMigrateGrid.Visibility = cmbOperation.SelectedIndex == 1 ? Visibility.Visible : Visibility.Collapsed;

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
        }
    }
}
