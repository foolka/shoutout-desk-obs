#include "../src/dock.hpp"
#include <QApplication>
#include <QMainWindow>
#include <QDockWidget>
#include <QMessageBox>
#include <QPushButton>
#include <QTabWidget>
#include <QTimer>
#include <QTemporaryDir>
#include <QDir>
#include <cstdio>

class ShoutoutDockTest {
public:
    static void require(bool value,const char *message){if(!value){std::fprintf(stderr,"%s\n",message);std::exit(1);}}
    static void state(ShoutoutDock *dock,bool required,const QString &status){
        dock->state["auth"]=QJsonObject{{"user",QJsonObject{{"id","999001"},{"login","demo_channel"}}},{"reauthRequired",required},{"status",status}};
        auto prefs=dock->state.value("prefs").toObject();prefs["provider"]="direct";dock->state["prefs"]=prefs;dock->render();
    }
    static void run(ShoutoutDock *dock,QDockWidget *host,const QString &output){
        require(!dock->state.isEmpty(),"Worker did not initialize");
        state(dock,false,"retrying");host->hide();
        QTimer::singleShot(2200,dock,[=]{
            require(!dock->authWarning,"Network failure displayed a login warning");
            require(dock->loginButton->isHidden(),"Network failure displayed login button");
            state(dock,true,"reauth_required");
            QTimer::singleShot(2200,dock,[=]{
                require(dock->authWarning&&dock->authWarning->isVisible(),"Hidden dock did not notify");
                require(!host->isVisible(),"Warning unexpectedly opened dock");
                require(dock->authWarning->windowModality()==Qt::NonModal,"Warning blocks OBS");
                require(!dock->loginButton->isHidden(),"Invalid saved user hides login button");
                dock->authWarning->grab().save(output+"/reauth-warning.png");
                dock->authWarning->reject();state(dock,true,"reauth_required");
                QTimer::singleShot(2200,dock,[=]{
                    require(!dock->authWarning,"Dismissed warning repeated");
                    state(dock,false,"ready");state(dock,true,"reauth_required");
                    QTimer::singleShot(2200,dock,[=]{
                        require(dock->authWarning&&dock->authWarning->isVisible(),"New invalid session did not notify");
                        for(auto b:dock->authWarning->buttons())if(dock->authWarning->buttonRole(b)==QMessageBox::ActionRole)b->click();
                        require(host->isVisible()&&dock->tabs->currentIndex()==2,"Settings button did not reveal dock");
                        state(dock,false,"ready");
                        require(!dock->authWarning||!dock->authWarning->isVisible(),"Recovered session keeps warning visible");
                        std::puts("PASS: hidden dock, transient outage silence, nonmodal warning, dismissal deduplication, settings and recovery");
                        QApplication::quit();
                    });
                });
            });
        });
    }
};

int main(int argc,char **argv){
    QApplication app(argc,argv);if(argc<3)return 2;
    QTemporaryDir profile;QMainWindow main;main.resize(900,760);
    auto host=new QDockWidget("Shoutout Desk",&main);
    auto dock=new ShoutoutDock(QString::fromLocal8Bit(argv[1]),profile.path(),true,host);
    host->setWidget(dock);main.addDockWidget(Qt::RightDockWidgetArea,host);main.show();host->hide();
    const QString output=QString::fromLocal8Bit(argv[2]);QDir().mkpath(output);
    QTimer::singleShot(1500,dock,[=]{ShoutoutDockTest::run(dock,host,output);});
    QTimer::singleShot(20000,&app,[]{std::exit(2);});
    return app.exec();
}
