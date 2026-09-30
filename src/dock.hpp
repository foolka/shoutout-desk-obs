#pragma once
#include <QWidget>
#include <QJsonObject>
#include <QHash>
#include <QProcess>
#include <QLayout>
#include <QLockFile>
#include <functional>
#include <memory>

class QLabel;
class QLineEdit;
class QComboBox;
class QCheckBox;
class QSlider;
class QPushButton;
class QToolButton;
class QTabWidget;
class QVBoxLayout;
class QDateEdit;
class QDockWidget;

class FlowLayout : public QLayout {
public:
    explicit FlowLayout(QWidget *parent = nullptr);
    ~FlowLayout() override;
    void addItem(QLayoutItem *item) override;
    int count() const override;
    QLayoutItem *itemAt(int index) const override;
    QLayoutItem *takeAt(int index) override;
    Qt::Orientations expandingDirections() const override;
    bool hasHeightForWidth() const override;
    int heightForWidth(int width) const override;
    QSize minimumSize() const override;
    QSize sizeHint() const override;
    void setGeometry(const QRect &rect) override;
private:
    int arrange(const QRect &rect, bool test) const;
    QList<QLayoutItem *> items;
};

class ShoutoutDock : public QWidget {
public:
    ShoutoutDock(QString dataRoot, QString profileRoot, bool preview = false, QWidget *parent = nullptr);
    ~ShoutoutDock() override;
    void stop();
protected:
    void resizeEvent(QResizeEvent *event) override;
private:
    QString dataRoot, profileRoot, language;
    bool preview = false, stopped = false, painting = false;
    QProcess *worker = nullptr;
    std::unique_ptr<QLockFile> lock;
    QByteArray buffer;
    qint64 requestId = 0;
    QHash<qint64, std::function<void(QJsonValue)>> callbacks;
    QJsonObject state, words;
    QLabel *connection = nullptr, *accountLabel = nullptr, *summary = nullptr, *notice = nullptr;
    QLabel *hoursLabel = nullptr, *codeLabel = nullptr, *authLabel = nullptr, *versionLabel = nullptr;
    QCheckBox *enabled = nullptr, *resetAfterLongClose = nullptr, *raidShoutouts = nullptr, *autoUpdates = nullptr;
    QPushButton *updateBanner = nullptr;
    QTabWidget *tabs = nullptr;
    QLineEdit *addEdit = nullptr, *search = nullptr, *historySearch = nullptr, *clientEdit = nullptr;
    QComboBox *sort = nullptr, *languages = nullptr, *provider = nullptr;
    QWidget *directSettings = nullptr, *botSettings = nullptr;
    QLineEdit *botPath = nullptr;
    QDateEdit *since = nullptr;
    QSlider *hours = nullptr;
    QWidget *peopleBox = nullptr, *historyBox = nullptr;
    FlowLayout *peopleLayout = nullptr;
    QVBoxLayout *historyLayout = nullptr;
    QPushButton *loginButton = nullptr, *logoutButton = nullptr, *openAuthButton = nullptr;
    QToolButton *dockToggle = nullptr;
    int historyLimit = 40;
    QString peopleSignature, historySignature;
    void loadLanguage();
    QString t(const char *key) const;
    void build();
    void startWorker();
    void command(const QString &method, QJsonObject params = {}, std::function<void(QJsonValue)> callback = {});
    void readWorker();
    void render();
    void renderPeople();
    void renderHistory();
    void showError(const QString &message);
    QDockWidget *hostDock() const;
    void toggleDocking();
    void updateDockButton();
    void setupBot(const QString &path);
    void openUrl(const QString &url);
    QIcon icon(const QString &name) const;
    QToolButton *tool(const QString &name, const QString &tooltip);
    QPushButton *button(const QString &label, const QString &symbol = {});
    void clearLayout(QLayout *layout);
};
