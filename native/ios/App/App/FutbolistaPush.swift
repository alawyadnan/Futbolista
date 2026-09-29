import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging
import Capacitor

// General group announcements only. Tokens never enter JavaScript, Firestore or logs.
final class FutbolistaPush: NSObject, UNUserNotificationCenterDelegate, MessagingDelegate {
    static let shared = FutbolistaPush()
    static let changed = Notification.Name("FutbolistaPushChanged")
    static let opened = Notification.Name("FutbolistaPushOpened")
    private let preference = "futbolista.notifications.enabled"
    private let topic = "futbolista_updates"
    private(set) var ready = false
    private(set) var failed = false
    private var pendingRoute: String?
    var enabled: Bool { UserDefaults.standard.bool(forKey: preference) }
    var configured: Bool { Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil }

    func start() {
        UNUserNotificationCenter.current().delegate = self
        refresh()
    }
    private func changedState() {
        NotificationCenter.default.post(name: Self.changed, object: nil)
    }
    private func configure() -> Bool {
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let options = FirebaseOptions(contentsOfFile: path), options.projectID == "el-futbolistas",
              options.bundleID == "live.ftbll.futbolista" else { return false }
        if FirebaseApp.app() == nil { FirebaseApp.configure(options: options) }
        Messaging.messaging().delegate = self
        return true
    }
    func refresh() {
        guard enabled else { return }
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                guard self.enabled else { return }
                if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
                    self.register()
                } else {
                    self.disable()
                }
            }
        }
    }
    private func register() {
        guard enabled, configure() else { return }
        failed = false
        Messaging.messaging().isAutoInitEnabled = true
        UIApplication.shared.registerForRemoteNotifications()
        changedState()
    }
    func enable(_ completion: @escaping (Bool) -> Void) {
        guard configured else { completion(false); return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            DispatchQueue.main.async {
                if granted && error == nil {
                    UserDefaults.standard.set(true, forKey: self.preference)
                    self.register()
                }
                self.changedState()
                completion(granted && error == nil)
            }
        }
    }
    func disable() {
        UserDefaults.standard.set(false, forKey: preference)
        ready = false
        failed = false
        UIApplication.shared.unregisterForRemoteNotifications()
        if FirebaseApp.app() != nil {
            Messaging.messaging().isAutoInitEnabled = false
            // Unregistering APNs stops delivery even if cleanup is temporarily offline.
            Messaging.messaging().unsubscribe(fromTopic: topic) { _ in
                DispatchQueue.main.async {
                    guard !self.enabled else { return }
                    Messaging.messaging().deleteToken { _ in }
                }
            }
        }
        changedState()
    }
    func registered(_ token: Data) {
        guard enabled, configure() else { return }
        Messaging.messaging().apnsToken = token
        Messaging.messaging().token { token, error in
            DispatchQueue.main.async {
                guard self.enabled else { return }
                if error != nil || token == nil { self.registrationFailed(); return }
                self.subscribe()
            }
        }
    }
    func registrationFailed() { ready = false; failed = true; changedState() }
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        DispatchQueue.main.async {
            guard self.enabled, fcmToken != nil, messaging.apnsToken != nil else { return }
            self.subscribe()
        }
    }
    private func subscribe() {
        guard enabled else { return }
        Messaging.messaging().subscribe(toTopic: topic) { error in
            DispatchQueue.main.async {
                guard self.enabled else { return }
                self.ready = error == nil
                self.failed = error != nil
                self.changedState()
            }
        }
    }
    func status(_ completion: @escaping ([String: Any]) -> Void) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                let permission: String
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral: permission = "granted"
                case .denied: permission = "denied"
                default: permission = "prompt"
                }
                completion(["configured": self.configured, "permission": permission,
                            "enabled": self.enabled, "ready": self.ready, "failed": self.failed])
            }
        }
    }
    func consumeRoute() -> String? {
        defer { pendingRoute = nil }
        return pendingRoute
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler(enabled ? [.banner, .sound] : [])
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        DispatchQueue.main.async {
            if self.enabled {
                let requested = response.notification.request.content.userInfo["screen"] as? String ?? "dashboard"
                self.pendingRoute = ["dashboard", "history", "leaderboard"].contains(requested) ? requested : "dashboard"
                NotificationCenter.default.post(name: Self.opened, object: nil)
            }
            completionHandler()
        }
    }
}

@objc(FutbolistaPushPlugin)
public class FutbolistaPushPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FutbolistaPushPlugin"
    public let jsName = "FutbolistaPush"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumeRoute", returnType: CAPPluginReturnPromise)
    ]
    private var observers: [NSObjectProtocol] = []
    public override func load() {
        observers.append(NotificationCenter.default.addObserver(forName: FutbolistaPush.changed, object: nil, queue: .main) { [weak self] _ in
            FutbolistaPush.shared.status { self?.notifyListeners("statusChanged", data: $0) }
        })
        observers.append(NotificationCenter.default.addObserver(forName: FutbolistaPush.opened, object: nil, queue: .main) { [weak self] _ in
            self?.notifyListeners("notificationOpened", data: [:])
        })
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }
    @objc func getStatus(_ call: CAPPluginCall) {
        DispatchQueue.main.async { FutbolistaPush.shared.status { call.resolve($0) } }
    }
    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { FutbolistaPush.shared.enable { _ in FutbolistaPush.shared.status { call.resolve($0) } } }
    }
    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async { FutbolistaPush.shared.disable(); FutbolistaPush.shared.status { call.resolve($0) } }
    }
    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else { call.reject("Settings unavailable"); return }
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }
    @objc func consumeRoute(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["screen": FutbolistaPush.shared.consumeRoute() ?? ""]) }
    }
}

class FutbolistaViewController: CAPBridgeViewController {
    override func capacitorDidLoad() { bridge?.registerPluginInstance(FutbolistaPushPlugin()) }
}
