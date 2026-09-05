#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <AVFoundation/AVFoundation.h>

NS_ASSUME_NONNULL_BEGIN

typedef void (^FRSResolve)(id _Nullable result);
typedef void (^FRSReject)(NSString *code, NSString * _Nullable message, NSError * _Nullable error);
typedef void (^FRSEventHandler)(NSString *json);

@interface FaceRecognitionSdkBridge : NSObject

@property (nonatomic, copy, nullable) FRSEventHandler eventHandler;

+ (instancetype)shared;
+ (BOOL)isAvailable;

- (void)getMachineCode:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)setActivation:(NSString *)license resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)initSDK:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)deinitSDK:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)lastLicenseError:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)setLandmarkMode:(NSNumber *)mode resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)getLandmarkMode:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)detect:(NSString *)imageUri crop:(BOOL)crop flags:(NSNumber *)flags resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)faceDetection:(NSString *)imageUri paramJson:(nullable NSString *)paramJson resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)estimatorStatus:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)templateExtraction:(NSString *)imageUri faceBoxJson:(NSString *)faceBoxJson resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)cropFace:(NSString *)imageUri faceBoxJson:(NSString *)faceBoxJson resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)extractFeature:(NSString *)imageUri resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)similarity:(NSString *)feature1B64 feature2B64:(NSString *)feature2B64 resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)quality:(NSString *)imageUri crop:(BOOL)crop resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)startVideoWorker:(nullable NSString *)configJson resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)stopVideoWorker:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)syncVideoWorkerDatabase:(NSArray *)featuresB64 matchThreshold:(NSNumber *)matchThreshold resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)probeLiveImage:(NSString *)imageUri resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)applyLiveFrame:(NSString *)imageUri rotateDegrees:(NSNumber *)rotateDegrees maxEdge:(NSNumber *)maxEdge feedWorker:(BOOL)feedWorker resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)ingestCameraImage:(UIImage *)image;
- (void)exportLastLiveFrame:(FRSResolve)resolve rejecter:(FRSReject)reject;
- (void)writeStatus:(NSString *)json resolver:(FRSResolve)resolve rejecter:(FRSReject)reject;

@end

NS_ASSUME_NONNULL_END
