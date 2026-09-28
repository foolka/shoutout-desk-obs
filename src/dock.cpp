#include "dock.hpp"
#include <QApplication>
#include <QCheckBox>
#include <QClipboard>
#include <QComboBox>
#include <QDateEdit>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileDialog>
#include <QFrame>
#include <QHBoxLayout>
#include <QJsonArray>
#include <QJsonDocument>
#include <QLabel>
#include <QLineEdit>
#include <QMessageBox>
#include <QDockWidget>
#include <QMainWindow>
#include <QPushButton>
#include <QScrollArea>
#include <QSet>
#include <QPointer>
#include <QSignalBlocker>
#include <QSlider>
#include <QTabWidget>
#include <QTabBar>
#include <QResizeEvent>
#include <QTimer>
#include <QToolButton>
#include <QUrl>
#include <QVBoxLayout>
#include <algorithm>

FlowLayout::FlowLayout(QWidget *parent) : QLayout(parent) { setContentsMargins(0,0,0,0); setSpacing(8); }
FlowLayout::~FlowLayout() { while (auto item = takeAt(0)) delete item; }
void FlowLayout::addItem(QLayoutItem *item) { items.append(item); }
int FlowLayout::count() const { return items.size(); }
QLayoutItem *FlowLayout::itemAt(int index) const { return items.value(index); }
QLayoutItem *FlowLayout::takeAt(int index) { return index >= 0 && index < items.size() ? items.takeAt(index) : nullptr; }
Qt::Orientations FlowLayout::expandingDirections() const { return {}; }
bool FlowLayout::hasHeightForWidth() const { return true; }
int FlowLayout::heightForWidth(int width) const { return arrange(QRect(0,0,width,0), true); }
QSize FlowLayout::minimumSize() const { QSize size; for(auto item:items) size=size.expandedTo(item->minimumSize()); return size; }
QSize FlowLayout::sizeHint() const { return minimumSize(); }
void FlowLayout::setGeometry(const QRect &rect) { QLayout::setGeometry(rect); arrange(rect,false); }
int FlowLayout::arrange(const QRect &rect, bool test) const {
    int x=rect.x(), y=rect.y(), lineHeight=0;
    for(auto item:items) {
        QSize size=item->sizeHint(); size.setWidth(qMin(size.width(),rect.width()));
        if(x>rect.x() && x+size.width()>rect.right()+1) { x=rect.x(); y+=lineHeight+spacing(); lineHeight=0; }
        if(!test)item->setGeometry(QRect(QPoint(x,y),size));
        x+=size.width()+spacing(); lineHeight=qMax(lineHeight,size.height());
    }
    return y+lineHeight-rect.y();
}

static QLabel *label(const QString &text, const char *name = nullptr) {
    auto w=new QLabel(text); w->setTextFormat(Qt::PlainText); w->setWordWrap(true);
    if(name)w->setObjectName(name);return w;
}
static QScrollArea *scrollArea(QWidget *content) {
    auto area=new QScrollArea; area->setWidgetResizable(true); area->setFrameShape(QFrame::NoFrame);
    area->setHorizontalScrollBarPolicy(Qt::ScrollBarAlwaysOff); area->setWidget(content);return area;
}
static QVBoxLayout *column(QWidget *widget, int margin=0) {
    auto l=new QVBoxLayout(widget);l->setContentsMargins(margin,margin,margin,margin);l->setSpacing(12);return l;
}
ShoutoutDock::ShoutoutDock(QString data, QString profile, bool demo, QWidget *parent)
    : QWidget(parent), dataRoot(std::move(data)),profileRoot(std::move(profile)),language("ru-RU"),preview(demo) {
    setObjectName("ShoutoutDock");setMinimumSize(320,380);resize(420,720);
    loadLanguage();build();
    QTimer::singleShot(0,this,[this]{startWorker();});
    auto timer=new QTimer(this);timer->setInterval(15000);
    connect(timer,&QTimer::timeout,this,[this]{if(!state.isEmpty())render();});timer->start();
}
ShoutoutDock::~ShoutoutDock() { stop(); }
void ShoutoutDock::resizeEvent(QResizeEvent *event){
    QWidget::resizeEvent(event);
    if(!tabs)return;
    const char *names[]={"people","history","settings"};
    for(int i=0;i<3;i++){tabs->setTabText(i,width()<365?QString():t(names[i]));tabs->setTabToolTip(i,t(names[i]));}
    tabs->tabBar()->setExpanding(width()<365);
}
void ShoutoutDock::stop() {
    if(stopped)return;stopped=true;
    if(worker && worker->state()!=QProcess::NotRunning){
        worker->write("{\"id\":999999999,\"method\":\"quit\"}\n");worker->closeWriteChannel();
        if(!worker->waitForFinished(1800)){worker->kill();worker->waitForFinished(1000);}
    }
    lock.reset();
}
void ShoutoutDock::loadLanguage(){
    QFile file(dataRoot+"/data/locale/"+language+".json");
    if(file.open(QIODevice::ReadOnly))words=QJsonDocument::fromJson(file.readAll()).object();
}
QString ShoutoutDock::t(const char *key) const {return words.value(QLatin1String(key)).toString(QString::fromLatin1(key));}
QIcon ShoutoutDock::icon(const QString &name) const {return QIcon(dataRoot+"/data/icons/"+name+".svg");}
QToolButton *ShoutoutDock::tool(const QString &name,const QString &tooltip){
    auto b=new QToolButton;b->setIcon(icon(name));b->setIconSize(QSize(17,17));b->setToolTip(tooltip);b->setAccessibleName(tooltip);b->setFixedSize(32,32);return b;
}
QPushButton *ShoutoutDock::button(const QString &text,const QString &symbol){
    auto b=new QPushButton(text);if(!symbol.isEmpty())b->setIcon(icon(symbol));b->setMinimumHeight(34);return b;
}
void ShoutoutDock::build(){
    QFile sheet(dataRoot+"/data/style.qss");
    if(sheet.open(QIODevice::ReadOnly)){auto css=QString::fromUtf8(sheet.readAll());css.replace("@DATA@",QDir::fromNativeSeparators(dataRoot));setStyleSheet(css);}
    auto root=column(this,14);
    auto header=new QHBoxLayout;
    auto mark=label("S","brand");mark->setAlignment(Qt::AlignCenter);mark->setFixedSize(34,34);header->addWidget(mark);
    auto titles=new QVBoxLayout;titles->setSpacing(1);titles->addWidget(label("Shoutout Desk","title"));titles->addWidget(label("OBS EDITION","eyebrow"));header->addLayout(titles);header->addStretch();
    if(!preview){
        dockToggle=tool("panel-right",t("dockInObs"));dockToggle->setObjectName("dockToggle");dockToggle->setEnabled(false);header->addWidget(dockToggle);
        connect(dockToggle,&QToolButton::clicked,this,[this]{toggleDocking();});
        // OBS creates the QDockWidget wrapper after constructing this widget.
        QTimer::singleShot(0,dockToggle,[this]{
            if(auto container=hostDock())connect(container,&QDockWidget::topLevelChanged,dockToggle,[this](bool){updateDockButton();});
            updateDockButton();
        });
    }
    auto reconnect=tool("refresh-cw",t("reconnect"));header->addWidget(reconnect);connect(reconnect,&QToolButton::clicked,this,[this]{command("reconnect");});root->addLayout(header);
    auto account=new QHBoxLayout;accountLabel=label(t("restoring"),"account");account->addWidget(accountLabel,1);
    enabled=new QCheckBox(t("enabled"));enabled->setEnabled(false);account->addWidget(enabled);
    connect(enabled,&QCheckBox::toggled,this,[this](bool checked){if(!painting)command("prefs",{{"enabled",checked}});});root->addLayout(account);
    notice=label({},"notice");notice->hide();root->addWidget(notice);
    tabs=new QTabWidget;tabs->setObjectName("tabs");root->addWidget(tabs,1);

    auto people=new QWidget;auto p=column(people);p->setContentsMargins(0,12,0,0);
    auto addRow=new QHBoxLayout;addEdit=new QLineEdit;addEdit->setObjectName("addName");addEdit->setPlaceholderText(t("nickname"));addEdit->setMaxLength(150);addRow->addWidget(addEdit,1);
    auto add=tool("plus",t("add"));add->setObjectName("primaryTool");addRow->addWidget(add);p->addLayout(addRow);
    auto addName=[this]{const auto value=addEdit->text().trimmed();if(!value.isEmpty())command("add",{{"login",value}},[this](QJsonValue){addEdit->clear();});};
    connect(add,&QToolButton::clicked,this,addName);connect(addEdit,&QLineEdit::returnPressed,this,addName);
    search=new QLineEdit;search->setObjectName("searchName");search->setPlaceholderText(t("search"));search->setClearButtonEnabled(true);p->addWidget(search);
    auto filters=new QHBoxLayout;filters->setSpacing(4);sort=new QComboBox;sort->addItems({t("newest"),t("oldest"),t("nameAZ")});sort->setMinimumWidth(88);filters->addWidget(sort,1);
    since=new QDateEdit;since->setCalendarPopup(true);since->setMinimumDate(QDate(2000,1,1));since->setDate(since->minimumDate());since->setSpecialValueText(t("allDates"));since->setDisplayFormat("dd.MM.yyyy");since->setToolTip(t("addedSince"));since->setFixedWidth(138);filters->addWidget(since);
    auto resetDate=tool("x",t("clearDate"));resetDate->setFixedWidth(26);filters->addWidget(resetDate);p->addLayout(filters);
    connect(resetDate,&QToolButton::clicked,this,[this]{since->setDate(since->minimumDate());});
    summary=label({},"muted");p->addWidget(summary);
    auto peopleOuter=new QWidget;auto outer=column(peopleOuter);peopleBox=new QWidget;peopleLayout=new FlowLayout(peopleBox);outer->addWidget(peopleBox);outer->addStretch();p->addWidget(scrollArea(peopleOuter),1);
    tabs->addTab(people,icon("users"),t("people"));
    connect(search,&QLineEdit::textChanged,this,[this]{peopleSignature.clear();renderPeople();});
    connect(sort,&QComboBox::currentIndexChanged,this,[this]{peopleSignature.clear();renderPeople();});
    connect(since,&QDateEdit::dateChanged,this,[this]{peopleSignature.clear();renderPeople();});

    auto history=new QWidget;auto h=column(history);h->setContentsMargins(0,12,0,0);
    historySearch=new QLineEdit;historySearch->setPlaceholderText(t("search"));historySearch->setClearButtonEnabled(true);h->addWidget(historySearch);
    historyBox=new QWidget;historyLayout=column(historyBox);historyLayout->setSpacing(0);historyLayout->setAlignment(Qt::AlignTop);h->addWidget(scrollArea(historyBox),1);
    tabs->addTab(history,icon("history"),t("history"));
    connect(historySearch,&QLineEdit::textChanged,this,[this]{historySignature.clear();historyLimit=40;renderHistory();});

    auto settings=new QWidget;auto s=column(settings);s->setContentsMargins(0,12,6,8);
    s->addWidget(label(t("twitch"),"section"));authLabel=label(t("restoring"),"muted");s->addWidget(authLabel);
    clientEdit=new QLineEdit;clientEdit->setPlaceholderText("Public Client ID");clientEdit->setMaxLength(64);s->addWidget(clientEdit);
    loginButton=button(t("login"),"log-in");loginButton->setObjectName("primary");s->addWidget(loginButton);
    connect(loginButton,&QPushButton::clicked,this,[this]{command("login",{{"clientId",clientEdit->text()}},[this](QJsonValue value){auto pending=value.toObject().value("pending").toObject();if(!pending.isEmpty())openUrl(pending.value("url").toString());});});
    codeLabel=label({},"authCode");codeLabel->setAlignment(Qt::AlignCenter);codeLabel->setTextInteractionFlags(Qt::TextSelectableByMouse);s->addWidget(codeLabel);
    openAuthButton=button(t("openTwitch"),"external-link");s->addWidget(openAuthButton);connect(openAuthButton,&QPushButton::clicked,this,[this]{openUrl(state.value("auth").toObject().value("pending").toObject().value("url").toString());});
    logoutButton=button(t("logout"),"log-out");s->addWidget(logoutButton);
    connect(logoutButton,&QPushButton::clicked,this,[this]{if(QMessageBox::question(this,t("logout"),t("logoutConfirm"))==QMessageBox::Yes)command("logout");});
    auto help=button(t("setupGuide"),"book-open");s->addWidget(help);connect(help,&QPushButton::clicked,this,[this]{openUrl("https://github.com/foolka/shoutout-desk-obs#setup");});
    s->addSpacing(8);s->addWidget(label(t("interval"),"section"));hoursLabel=label({},"value");s->addWidget(hoursLabel);
    hours=new QSlider(Qt::Horizontal);hours->setRange(1,168);hours->setSingleStep(1);hours->setPageStep(6);s->addWidget(hours);
    connect(hours,&QSlider::valueChanged,this,[this](int value){hoursLabel->setText(t("hours").arg(value));});
    auto saveTimer=new QTimer(hours);saveTimer->setSingleShot(true);saveTimer->setInterval(300);
    connect(hours,&QSlider::valueChanged,this,[this,saveTimer]{if(!painting)saveTimer->start();});
    connect(saveTimer,&QTimer::timeout,this,[this]{command("prefs",{{"cooldownHours",hours->value()}});});
    resetAfterLongClose=new QCheckBox(t("resetAfterLongClose"));s->addWidget(resetAfterLongClose);
    connect(resetAfterLongClose,&QCheckBox::toggled,this,[this](bool checked){if(!painting)command("prefs",{{"resetAfterLongClose",checked}});});
    s->addWidget(label(t("resetAfterLongCloseHelp"),"muted"));
    auto resetCooldowns=button(t("resetCooldowns"),"rotate-ccw");s->addWidget(resetCooldowns);
    connect(resetCooldowns,&QPushButton::clicked,this,[this]{
        const auto answer=QMessageBox::question(this,t("resetCooldowns"),t("resetCooldownsConfirm"),QMessageBox::Yes|QMessageBox::No,QMessageBox::No);
        if(answer==QMessageBox::Yes)command("resetCooldowns",{},[this](QJsonValue){QMessageBox::information(this,t("resetCooldowns"),t("cooldownsReset"));});
    });
    s->addSpacing(8);s->addWidget(label(t("data"),"section"));
    auto transfer=new QHBoxLayout;auto import=button(t("import"),"upload");auto exportButton=button(t("export"),"download");transfer->addWidget(import);transfer->addWidget(exportButton);s->addLayout(transfer);
    connect(import,&QPushButton::clicked,this,[this]{
        auto file=QFileDialog::getOpenFileName(this,t("import"),{},"Shoutout data (*.json *.sqlite)");if(file.isEmpty())return;
        if(QMessageBox::question(this,t("import"),t("importConfirm"))!=QMessageBox::Yes)return;
        command("import",{{"path",file}},[this](QJsonValue result){QMessageBox::information(this,t("import"),t("imported").arg(result.toObject().value("people").toInt()));});
    });
    connect(exportButton,&QPushButton::clicked,this,[this]{auto file=QFileDialog::getSaveFileName(this,t("export"),"shoutout-desk-"+QDateTime::currentDateTime().toString("yyyyMMdd-HHmmss")+".json","JSON (*.json)");if(!file.isEmpty())command("export",{{"path",file}},[this](QJsonValue){QMessageBox::information(this,t("export"),t("exported"));});});
    auto folder=button(t("openData"),"folder-open");s->addWidget(folder);connect(folder,&QPushButton::clicked,this,[this]{QDesktopServices::openUrl(QUrl::fromLocalFile(profileRoot));});
    s->addWidget(label(t("localData"),"muted"));s->addSpacing(8);
    s->addWidget(label(t("language"),"section"));languages=new QComboBox;languages->setObjectName("language");
    languages->addItem("Українська","uk-UA");languages->addItem("Русский","ru-RU");languages->addItem("English","en-US");languages->setCurrentIndex(languages->findData(language));s->addWidget(languages);
    connect(languages,&QComboBox::currentIndexChanged,this,[this](int index){if(!painting)command("language",{{"value",languages->itemData(index).toString()}});});
    s->addSpacing(8);versionLabel=label("Shoutout Desk OBS","muted");s->addWidget(versionLabel);
    auto update=button(t("checkUpdate"),"refresh-cw");s->addWidget(update);
    connect(update,&QPushButton::clicked,this,[this,update]{update->setEnabled(false);QPointer<QPushButton> guard(update);command("update",{},[this,guard](QJsonValue v){if(guard)guard->setEnabled(true);auto r=v.toObject();if(r.value("available").toBool()){if(QMessageBox::question(this,t("update"),t("updateAvailable").arg(r.value("version").toString()))==QMessageBox::Yes)openUrl(r.value("url").toString());}else QMessageBox::information(this,t("update"),t("upToDate"));});QTimer::singleShot(15000,update,[update]{update->setEnabled(true);});});
    s->addStretch();tabs->addTab(scrollArea(settings),icon("settings-2"),t("settings"));
    connection=label(t("starting"),"connection");root->addWidget(connection);
    codeLabel->hide();openAuthButton->hide();logoutButton->hide();loginButton->hide();clientEdit->hide();
}
void ShoutoutDock::startWorker(){
    QDir().mkpath(profileRoot);lock=std::make_unique<QLockFile>(profileRoot+"/worker.lock");lock->setStaleLockTime(0);
    if(!lock->tryLock(0)){showError(t("alreadyRunning"));return;}
    worker=new QProcess(this);worker->setProgram(dataRoot+"/runtime/node.exe");
    QStringList args{"--disable-warning=ExperimentalWarning",dataRoot+"/worker.cjs",profileRoot,dataRoot+"/shoutout-secure.exe"};if(preview)args<<"--offline-demo";
    worker->setArguments(args);worker->setWorkingDirectory(dataRoot);
    auto env=QProcessEnvironment::systemEnvironment();env.remove("NODE_OPTIONS");env.remove("NODE_PATH");worker->setProcessEnvironment(env);
    connect(worker,&QProcess::readyReadStandardOutput,this,[this]{readWorker();});
    connect(worker,&QProcess::readyReadStandardError,this,[this]{worker->readAllStandardError();});
    connect(worker,&QProcess::errorOccurred,this,[this](QProcess::ProcessError){if(!stopped)showError(t("workerFailed"));});
    connect(worker,QOverload<int,QProcess::ExitStatus>::of(&QProcess::finished),this,[this](int,QProcess::ExitStatus){if(!stopped){enabled->setEnabled(false);showError(t("workerFailed"));}});
    worker->start();
}
void ShoutoutDock::command(const QString &method,QJsonObject params,std::function<void(QJsonValue)> callback){
    if(stopped||!worker||worker->state()!=QProcess::Running){showError(t("workerFailed"));return;}
    const auto id=++requestId;if(callback)callbacks.insert(id,std::move(callback));
    QJsonObject request{{"id",id},{"method",method},{"params",params}};
    worker->write(QJsonDocument(request).toJson(QJsonDocument::Compact)+'\n');
}
void ShoutoutDock::readWorker(){
    buffer+=worker->readAllStandardOutput();
    if(buffer.size()>8*1024*1024){showError(t("workerFailed"));worker->kill();return;}
    int pos;
    while((pos=buffer.indexOf('\n'))>=0){
        auto line=buffer.left(pos);buffer.remove(0,pos+1);auto message=QJsonDocument::fromJson(line).object();
        if(message.value("event")=="state"){
            state=message.value("data").toObject();
            if(state.value("notice").toString().isEmpty())notice->hide();
            auto next=state.value("language").toString("ru-RU");
            if(next!=language){
                language=next;loadLanguage();const int index=tabs->currentIndex();
                clearLayout(layout());delete layout();build();tabs->setCurrentIndex(index);peopleSignature.clear();historySignature.clear();
            }
            render();
        }else if(message.value("event")=="fatal")showError(message.value("error").toString());
        else{
            const auto id=message.value("id").toInteger();auto cb=callbacks.take(id);
            if(message.contains("error"))showError(message.value("error").toString());else if(cb)cb(message.value("result"));
        }
    }
}
void ShoutoutDock::showError(const QString &message){notice->setText(message);notice->show();}
QDockWidget *ShoutoutDock::hostDock() const{
    for(auto parent=parentWidget();parent;parent=parent->parentWidget())if(auto container=qobject_cast<QDockWidget*>(parent))return container;
    return nullptr;
}
void ShoutoutDock::updateDockButton(){
    if(!dockToggle)return;
    auto container=hostDock();dockToggle->setEnabled(container!=nullptr);
    const bool floating=container&&container->isFloating();
    const auto action=t(floating?"dockInObs":"undockFromObs");
    dockToggle->setIcon(icon(floating?"panel-right":"external-link"));
    dockToggle->setToolTip(action);dockToggle->setAccessibleName(action);
}
void ShoutoutDock::toggleDocking(){
    auto container=hostDock();if(!container)return;
    auto main=qobject_cast<QMainWindow*>(container->parentWidget());
    if(!main)return;
    if(container->isFloating()){
        if(main->dockWidgetArea(container)==Qt::NoDockWidgetArea)main->addDockWidget(Qt::RightDockWidgetArea,container);
        container->setFloating(false);
    }else container->setFloating(true);
    container->show();container->raise();updateDockButton();
}
void ShoutoutDock::openUrl(const QString &value){
    const QUrl url(value);
    const bool twitch=url.scheme()=="https"&&url.host()=="www.twitch.tv"&&url.path()=="/activate";
    const bool repo=url.scheme()=="https"&&url.host()=="github.com"&&(url.path()=="/foolka/shoutout-desk-obs"||url.path().startsWith("/foolka/shoutout-desk-obs/"));
    if(twitch||repo)QDesktopServices::openUrl(url);
}
void ShoutoutDock::render(){
    painting=true;
    auto account=state.value("account").toObject(),auth=state.value("auth").toObject(),prefs=state.value("prefs").toObject();
    const bool logged=!auth.value("user").isNull()&&!auth.value("user").toObject().isEmpty();
    accountLabel->setText(account.value("channel").toString().isEmpty()?t("notConnected"):"@"+account.value("channel").toString());
    enabled->setEnabled(logged||preview);enabled->setChecked(prefs.value("enabled").toBool());
    resetAfterLongClose->setChecked(prefs.value("resetAfterLongClose").toBool());
    hours->setValue(prefs.value("cooldownHours").toInt(24));hoursLabel->setText(t("hours").arg(hours->value()));
    const bool connected=state.value("connected").toBool(),live=state.value("live").toBool();
    connection->setText(preview?t("demo"):connected?(live?t("live"):t("offline")):logged?t("connecting"):t("notConnected"));
    authLabel->setText(auth.value("message").toString().isEmpty()?(logged?"@"+auth.value("user").toObject().value("login").toString():t("notConnected")):auth.value("message").toString());
    versionLabel->setText("Shoutout Desk OBS "+state.value("version").toString());
    const auto pending=auth.value("pending").toObject();codeLabel->setText(pending.value("code").toString());codeLabel->setVisible(!pending.isEmpty());openAuthButton->setVisible(!pending.isEmpty());
    loginButton->setVisible(!logged);logoutButton->setVisible(logged);clientEdit->setVisible(!logged&&!state.value("clientConfigured").toBool());
    if(!state.value("notice").toString().isEmpty())showError(state.value("notice").toString());
    summary->setText(t("summary").arg(state.value("people").toArray().size()).arg(state.value("queue").toInt()).arg(prefs.value("cooldownHours").toInt(24)));
    painting=false;renderPeople();renderHistory();
}
void ShoutoutDock::clearLayout(QLayout *layout){
    if(!layout)return;
    while(auto item=layout->takeAt(0)){if(auto child=item->layout()){clearLayout(child);}if(auto widget=item->widget())delete widget;delete item;}
}
void ShoutoutDock::renderPeople(){
    if(!peopleLayout)return;auto list=state.value("people").toArray();QVector<QJsonObject> rows;
    auto now=QDateTime::currentMSecsSinceEpoch();
    const auto signature=QString::fromUtf8(QJsonDocument(list).toJson(QJsonDocument::Compact))+QString::number(now/60000);
    if(signature==peopleSignature)return;peopleSignature=signature;
    for(auto value:list){auto row=value.toObject();if(!row.value("login").toString().contains(search->text(),Qt::CaseInsensitive))continue;
        if(since->date()>since->minimumDate()&&QDateTime::fromMSecsSinceEpoch(row.value("added_at").toInteger()).date()<since->date())continue;rows.append(row);}
    std::sort(rows.begin(),rows.end(),[this](auto a,auto b){if(sort->currentIndex()==2)return a.value("login").toString()<b.value("login").toString();auto x=a.value("added_at").toInteger(),y=b.value("added_at").toInteger();return sort->currentIndex()==0?x>y:x<y;});
    clearLayout(peopleLayout);
    if(rows.isEmpty()){auto empty=label(list.isEmpty()?t("emptyPeople"):t("noResults"),"empty");empty->setMinimumHeight(100);empty->setAlignment(Qt::AlignCenter);peopleLayout->addWidget(empty);return;}
    for(auto row:rows){
        auto chip=new QFrame;chip->setObjectName("person");chip->setFixedHeight(48);auto line=new QHBoxLayout(chip);line->setContentsMargins(10,4,4,4);line->setSpacing(6);
        auto text=new QVBoxLayout;text->setSpacing(1);auto name=label(row.value("login").toString(),"personName");name->setWordWrap(false);text->addWidget(name);
        const qint64 remaining=row.value("nextAt").toInteger()-now;
        const auto caption=row.value("queued").toBool()?t("queued"):remaining<=0?t("ready"):t("remaining").arg((remaining+59999)/60000/60).arg(((remaining+59999)/60000)%60);
        auto status=label(caption,"personStatus");status->setWordWrap(false);text->addWidget(status);line->addLayout(text);
        auto remove=tool("x",t("remove"));remove->setFixedSize(26,28);line->addWidget(remove);
        connect(remove,&QToolButton::clicked,this,[this,row]{command("remove",{{"login",row.value("login")}});});peopleLayout->addWidget(chip);
    }
}
void ShoutoutDock::renderHistory(){
    if(!historyLayout)return;const auto rows=state.value("history").toArray();
    const auto signature=QString::fromUtf8(QJsonDocument(rows).toJson(QJsonDocument::Compact))+QString::fromUtf8(QJsonDocument(state.value("people").toArray()).toJson(QJsonDocument::Compact));
    if(signature==historySignature)return;historySignature=signature;clearLayout(historyLayout);
    QSet<QString> people;for(auto person:state.value("people").toArray())people.insert(person.toObject().value("login").toString());
    int count=0,total=0;
    for(auto value:rows){auto row=value.toObject();const auto login=row.value("login").toString();if(!login.contains(historySearch->text(),Qt::CaseInsensitive))continue;total++;if(count>=historyLimit)continue;count++;
        auto item=new QFrame;item->setObjectName("historyRow");auto l=new QHBoxLayout(item);l->setContentsMargins(0,10,0,10);auto details=new QVBoxLayout;details->setSpacing(3);
        details->addWidget(label(login,"personName"));
        const auto date=QDateTime::fromMSecsSinceEpoch(row.value("created_at").toInteger()).toString("dd.MM.yyyy  HH:mm");
        const auto status=row.value("status").toString();auto description=label(date+"  ·  "+t(status.toUtf8().constData()),"muted");description->setToolTip(row.value("detail").toString());details->addWidget(description);l->addLayout(details,1);
        if(!people.contains(login)){auto add=tool("user-plus",t("add"));l->addWidget(add);connect(add,&QToolButton::clicked,this,[this,login]{command("add",{{"login",login}});});}
        historyLayout->addWidget(item);
    }
    if(!count){auto empty=label(t("emptyHistory"),"empty");empty->setAlignment(Qt::AlignCenter);empty->setMinimumHeight(100);historyLayout->addWidget(empty);}
    if(total>count){auto more=button(t("showMore"),"chevron-down");historyLayout->addWidget(more);connect(more,&QPushButton::clicked,this,[this]{historyLimit+=40;historySignature.clear();renderHistory();});}
}
