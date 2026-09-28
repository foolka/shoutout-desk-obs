#include "dock.hpp"
#include <QApplication>
#include <QDir>
#include <QFile>
#include <QTimer>
#include <QJsonDocument>
#include <QTemporaryDir>
#include <QTabWidget>
#include <QComboBox>
#include <QScrollArea>
#include <QScrollBar>

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
        QTimer::singleShot(2100,&dock,[&dock,output]{dock.grab().save(output+"/settings.png");dock.findChild<QComboBox*>("provider")->setCurrentIndex(1);});
        QTimer::singleShot(2500,&dock,[&dock,output]{dock.grab().save(output+"/streamerbot.png");auto area=qobject_cast<QScrollArea*>(dock.findChild<QTabWidget*>()->widget(2));area->verticalScrollBar()->setValue(area->verticalScrollBar()->maximum());});
        QTimer::singleShot(2800,&dock,[&dock,output]{dock.grab().save(output+"/settings-data.png");dock.resize(320,550);});
        QTimer::singleShot(3100,&dock,[&dock,output]{dock.grab().save(output+"/narrow-settings.png");dock.findChild<QTabWidget*>()->setCurrentIndex(0);});
        QTimer::singleShot(3400,&dock,[&dock,output]{dock.grab().save(output+"/narrow-people.png");dock.findChild<QTabWidget*>()->setCurrentIndex(1);});
        QTimer::singleShot(3700,&dock,[&dock,output]{dock.grab().save(output+"/history.png");});
        QTimer::singleShot(4000,&app,&QApplication::quit);
    }
    return app.exec();
}
