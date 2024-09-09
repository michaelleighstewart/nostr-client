interface LoadingProps {
    vCentered: boolean;
  }

  const Loading: React.FC<LoadingProps> = (props: LoadingProps) => {
    return (
        <div className={props.vCentered ? "flex items-center justify-center h-screen" : "flex items-center justify-center"}>
            <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-white"></div>
        </div>
    );
  }
  
  export default Loading;