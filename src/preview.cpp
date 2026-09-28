#include "dock.hpp"
#include <QApplication>
#include <QDir>
#include <QFile>
#include <QTimer>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QTabWidget>

int main(int argc,char **argv){
    QApplication app(argc,argv);
    app.setApplicationName("Shoutout Desk OBS Preview");
    if(argc<2)return 2;
    QTemporaryDir profile;
    ShoutoutDock dock(QString::fromLocal8Bit(argv[1]),profile.path(),true);
    dock.setWindowTitle("Shoutout Desk OBS - offline preview");
    dock.resize(430,740);dock.show();
    if(argc>=3){
        const QString output=QString::fromLocal8Bit(argv[2]);QDir().mkpath(output);
        QTimer::singleShot(1800,&dock,[&dock,output]{dock.grab().save(output+"/people.png");auto tabs=dock.findChild<QTabWidget*>();tabs->setCurrentIndex(2);});
        QTimer::singleShot(2100,&dock,[&dock,output]{dock.grab().save(output+"/settings.png");dock.resize(320,550);});
        QTimer::singleShot(2500,&dock,[&dock,output]{dock.grab().save(output+"/narrow-settings.png");dock.findChild<QTabWidget*>()->setCurrentIndex(0);});
        QTimer::singleShot(2800,&dock,[&dock,output]{dock.grab().save(output+"/narrow-people.png");});
        QTimer::singleShot(3200,&app,&QApplication::quit);
    }
    return app.exec();
}
