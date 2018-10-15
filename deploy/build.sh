unameOut="$(uname -s)"
case "${unameOut}" in
    Linux*)     machine=Linux;;
    Darwin*)    machine=Mac;;
    MINGW*)     machine=MinGW;;
    *)          machine="UNKNOWN:${unameOut}"
esac

if [ ${machine} == "Mac" ] || [ ${machine} == "Linux" ]; then
  cp ../build/index.js ./
  sudo docker build -t games-v1 .
  sudo docker save -o games-v1.tar games-v1
  sudo chmod 666 games-v1.tar
  sudo docker rmi games-v1       
elif [ ${machine} == "MinGW" ]; then
  cp ../build/index.js ./
  docker build -t games-v1 .
  docker save -o games-v1.tar games-v1
  chmod 666 games-v1.tar
  docker rmi games-v1
fi

