#include "../src/dock.hpp"
#include <QApplication>
#include <QCheckBox>
#include <QDateTime>
#include <QDir>
#include <QElapsedTimer>
#include <QFileInfo>
#include <QJsonArray>
#include <QLabel>
#include <QTemporaryDir>
#include <QThread>
#include <QTimer>
#include <cstdio>

class ShoutoutDockTest {
public:
    static void require(bool value,const char *message){if(!value){std::fprintf(stderr,"%s\n",message);std::exit(1);}}
    static bool wait(const std::function<bool()> &ready,int timeout=12000){
        QElapsedTimer timer;timer.start();
        while(timer.elapsed()<timeout){QApplication::processEvents();if(ready())return true;QThread::msleep(10);}
        return ready();
    }
    static void run(const QString &data,const QString &output){
        QTemporaryDir profile;ShoutoutDock dock(data,profile.path(),true);dock.show();
        require(wait([&]{return dock.workerReady;}),"Worker did not initialize");
        bool replied=false;
        dock.command("add",{{"login","recovery_guest"}},[&](QJsonValue){replied=true;});
        require(wait([&]{return replied;}),"Add failed");replied=false;
        dock.command("prefs",{{"enabled",false}},[&](QJsonValue){replied=true;});
        require(wait([&]{return replied&&!dock.enabled->isChecked();}),"Pause failed");
        const auto oldPid=dock.worker->processId();dock.worker->kill();
        require(wait([&]{return dock.workerReady&&dock.worker->processId()!=oldPid&&dock.worker->state()==QProcess::Running;}),"Worker did not recover");
        require(dock.worker->arguments().contains("--recover-worker"),"Recovery startup flag missing");
        require(!dock.enabled->isChecked(),"Worker recovery unpaused automation");
        bool found=false;for(auto person:dock.state.value("people").toArray())if(person.toObject().value("login")=="recovery_guest")found=true;
        require(found,"People lost after recovery");
        require(QFileInfo::exists(profile.path()+"/worker-process.log"),"Diagnostic missing");
        const auto recoveredPid=dock.worker->processId();
        dock.workerLastReply=QDateTime::currentMSecsSinceEpoch()-46000;dock.checkWorker();
        require(wait([&]{return dock.workerReady&&dock.worker->processId()!=recoveredPid&&dock.worker->state()==QProcess::Running;}),"Heartbeat did not recover stalled worker");
        dock.stop();require(!dock.workerRetryTimer->isActive(),"Shutdown scheduled restart");
        for(const auto language:{"ru-RU","en-US","uk-UA"}){
            dock.language=QString::fromLatin1(language);dock.loadLanguage();dock.clearLayout(dock.layout());delete dock.layout();
            dock.build();dock.peopleSignature.clear();dock.historySignature.clear();dock.workerReady=true;dock.state["connected"]=true;
            auto prefs=dock.state.value("prefs").toObject();prefs["enabled"]=true;dock.state["prefs"]=prefs;
            dock.state["queueState"]=QJsonObject{{"count",2},{"login","someone_with_a_long_name"},{"nextAt",double(QDateTime::currentMSecsSinceEpoch()+95000)}};
            dock.render();
            for(int width:{320,420}){dock.resize(width,760);QApplication::processEvents();
                require(dock.queueLabel->isVisible(),"Queue status hidden");
                require(dock.queueLabel->geometry().right()<dock.width(),"Queue text overflows panel");
                require(dock.grab().save(output+"/queue-"+language+"-"+QString::number(width)+".png"),"Screenshot failed");
            }
        }
        QTemporaryDir missingProfile;ShoutoutDock missing(data+"/absent",missingProfile.path(),true);missing.show();
        require(wait([&]{return !missing.workerProblem.isEmpty();}),"Missing runtime was not diagnosed");
        require(!missing.workerRetryTimer->isActive(),"Missing files retried indefinitely");
        missing.dataRoot=data;missing.loadLanguage();missing.command("reconnect");
        require(wait([&]{return missing.workerReady;}),"Repair/reconnect did not recover");
        missing.stop();
        std::puts("PASS: worker crash/heartbeat recovery, retained pause/data, shutdown, missing-file repair, localized narrow/wide queue");
    }
};

int main(int argc,char **argv){
    QApplication app(argc,argv);if(argc<3)return 2;
    const QString output=QString::fromLocal8Bit(argv[2]);QDir().mkpath(output);
    ShoutoutDockTest::run(QString::fromLocal8Bit(argv[1]),output);return 0;
}
